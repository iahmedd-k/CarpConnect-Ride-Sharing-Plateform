const asyncHandler = require('express-async-handler');
const EmissionsReport = require('../models/EmissionReport');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const RideOffer = require('../models/RideOffer');

const normalizeDistanceKm = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  // Historical writes used meters in some flows; normalize to kilometers for UI/API.
  return numeric > 1000 ? numeric / 1000 : numeric;
};

// @desc    Get user's emissions history
// @route   GET /api/emissions
// @access  Private
const getMyEmissions = asyncHandler(async (req, res) => {
  const { startDate, endDate, rideId } = req.query;
  const userId = req.user._id;
  
  // Build query
  const query = {};
  
  // Date range filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      query.createdAt = { $gte: start, $lte: end };
    }
  } else if (startDate) {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      query.createdAt = { $gte: start };
    }
  } else if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime())) {
      query.createdAt = { $lte: end };
    }
  }
  
  // Ride filter
  if (rideId) {
    query.rideId = rideId;
  }
  
  // User-specific data
  query.userId = userId;
  
  // Get emissions reports
  const reports = await EmissionsReport.find(query)
    .sort({ createdAt: -1 });
  
  // Calculate statistics
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);
  const totalDistance = reports.reduce((sum, report) => sum + normalizeDistanceKm(report.distance), 0);
  const treesEquivalent = Number((totalSavings / 21).toFixed(3));
  const averageSavingsPerRide = reports.length > 0 ? Number((totalSavings / reports.length).toFixed(2)) : 0;

  const monthlyBuckets = new Map();
  reports.forEach((report) => {
    const d = new Date(report.createdAt);
    const monthIndex = d.getMonth();
    const year = d.getFullYear();
    const key = `${year}-${monthIndex}`;
    if (!monthlyBuckets.has(key)) {
      monthlyBuckets.set(key, {
        sortKey: new Date(year, monthIndex, 1).getTime(),
        month: d.toLocaleString('default', { month: 'short' }),
        co2: 0,
        distanceKm: 0,
        rides: 0,
        fuelSavedLiters: 0
      });
    }
    const bucket = monthlyBuckets.get(key);
    const distanceKm = normalizeDistanceKm(report.distance);
    bucket.co2 += Number(report.estimatedSavings || 0);
    bucket.distanceKm += distanceKm;
    bucket.fuelSavedLiters += distanceKm * 0.08;
    bucket.rides += 1;
  });
  const monthlyTrend = Array.from(monthlyBuckets.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-6)
    .map(({ sortKey, ...entry }) => ({
      ...entry,
      co2: Number(entry.co2.toFixed(2)),
      distanceKm: Number(entry.distanceKm.toFixed(2)),
      fuelSavedLiters: Number(entry.fuelSavedLiters.toFixed(2))
    }));
  
  // Get recent reports (last 20)
  const recentReports = reports.slice(0, 20).map(report => ({
    _id: report._id,
    rideId: report.rideId,
    estimatedSavings: report.estimatedSavings,
    distance: normalizeDistanceKm(report.distance),
    distanceKm: normalizeDistanceKm(report.distance),
    savedEmissionsKg: Number(report.estimatedSavings || 0),
    treesEquivalent: Number((Number(report.estimatedSavings || 0) / 21).toFixed(3)),
    vehicleType: report.vehicleType || 'car',
    fuelType: report.fuelType || 'petrol',
    calculationMethod: report.calculationMethod || 'average',
    carbonFactor: Number(report.carbonFactor || 0.171),
    calculationDetails: report.calculationDetails || null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    userId: report.userId
  }));
  
  // Get ride details for recent reports
  const rideIds = recentReports.map(r => r.rideId);
  const rides = await Match.find({ _id: { $in: rideIds } })
    .populate('offerId', 'driverId')
    .populate('requestId', 'riderId');
  
  // Add ride context to reports
  const rideMap = new Map(rides.map(ride => [String(ride._id), ride]));
  
  recentReports.forEach(report => {
    const ride = rideMap.get(report.rideId);
    if (ride) {
      report.ride = {
        driverId: ride.driverId,
        riderId: ride.riderIds[0],
        origin: ride.pickupPoints[0]?.coordinates,
        destination: ride.dropoffPoints[0]?.coordinates,
        departureTime: ride.offerId?.departureTime
      };
    }
  });
  
  // Return comprehensive data structure
  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalRides: reports.length,
        totalDistanceKm: Number(totalDistance.toFixed(2)),
        totalCo2SavedKg: Number(totalSavings.toFixed(2)),
        treesEquivalent,
        averageSavingsPerRide,
        fuelSavedLiters: Number((totalDistance * 0.08).toFixed(2)),
        monthlyTrend
      },
      recentReports,
      calculation: {
        baseline: 'solo petrol city car',
        formula: 'distanceKm x 0.171 x (1.5 - 1.0)',
        carbonFactorKgPerKm: 0.171,
        soloOccupancy: 1.5,
        sharedOccupancy: 1.0,
        note: 'Savings are estimated as avoided solo-driving emissions for the same trip distance.'
      },
      message: `Found ${reports.length} emissions reports`
    }
  });
});

// @desc    Get emissions report for a specific ride
// @route   GET /api/emissions/ride/:rideId
// @access  Private
const getRideEmissions = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId;
  const userId = req.user._id;
  
  // Verify user is a participant in the ride
  const match = await Match.findById(rideId);
  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Ride not found'
    });
  }
  
  const isParticipant = 
    (match.driverId && String(match.driverId) === String(userId)) ||
    (match.riderIds && match.riderIds.some(id => String(id) === String(userId)));
  
  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'You are not a participant in this ride'
    });
  }
  
  // Get emissions report for this ride
  const report = await EmissionsReport.findOne({ rideId, userId });
  
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'No emissions report found for this ride'
    });
  }
  
  // Return detailed emissions data
  res.status(200).json({
    success: true,
    data: {
      report: {
        _id: report._id,
        rideId: report.rideId,
        userId: report.userId,
        estimatedSavings: report.estimatedSavings,
        distance: normalizeDistanceKm(report.distance),
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        calculationMethod: report.calculationMethod,
        carbonFactor: report.carbonFactor
      },
      message: 'Emissions report retrieved successfully'
    }
  });
});

// @desc    Get emissions statistics
// @route   GET /api/emissions/stats
// @access  Private
const getEmissionsStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Get all emissions reports for user
  const reports = await EmissionsReport.find({ userId })
    .sort({ createdAt: -1 });
  
  // Calculate statistics
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);
  const totalDistance = reports.reduce((sum, report) => sum + normalizeDistanceKm(report.distance), 0);
  const treesEquivalent = Number((totalSavings / 21).toFixed(3));
  const averageSavings = reports.length > 0 ? totalSavings / reports.length : 0;
  
  // Get last 3 months of data for trend analysis
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  
  const recentReports = await EmissionsReport.find({
    userId,
    createdAt: { $gte: threeMonthsAgo }
  }).sort({ createdAt: 1 });
  
  // Calculate monthly trends
  const monthlyData = [];
  for (let i = 0; i < 3; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - (1 - i), 1);
    
    const monthReports = recentReports.filter(report => 
      report.createdAt >= monthStart && report.createdAt < monthEnd
    );
    
    monthlyData.push({
      month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
      savings: Number(monthReports.reduce((sum, report) => sum + report.estimatedSavings, 0).toFixed(2)),
      distance: Number(monthReports.reduce((sum, report) => sum + normalizeDistanceKm(report.distance), 0).toFixed(2))
    });
  }
  
  // Return comprehensive statistics
  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalRides: reports.length,
        totalDistanceKm: Number(totalDistance.toFixed(2)),
        totalCo2SavedKg: Number(totalSavings.toFixed(2)),
        treesEquivalent,
        averageSavingsPerRide: Number(averageSavings.toFixed(2)),
        monthlyTrend: monthlyData
      },
      message: 'Emissions statistics retrieved successfully'
    }
  });
});

module.exports = {
  getMyEmissions,
  getRideEmissions,
  getEmissionsStats
};
