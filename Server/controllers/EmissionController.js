const asyncHandler = require('express-async-handler');
const EmissionsReport = require('../models/EmissionReport');
const Match = require('../models/MatchModels');
const RideOffer = require('../models/RideOffer');
const { calculateEmissionsSavings } = require('../utils/fareCalculator');

// @desc    Get emissions report for a ride
// @route   GET /api/emissions/:rideId
// @access  Private
const getEmissionsReport = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId;
  const userId = req.user._id;

  // Verify user is a participant
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

  // Get emissions report
  const report = await EmissionsReport.findOne({ rideId, userId })
    .populate('rideId', 'offerId requestId')
    .populate({
      path: 'rideId',
      populate: {
        path: 'offerId',
        populate: {
          path: 'driverId',
          select: 'name email'
        }
      }
    })
    .populate({
      path: 'rideId',
      populate: {
        path: 'requestId',
        populate: {
          path: 'riderId',
          select: 'name email'
        }
      }
    });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'No emissions report found for this ride'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      report: {
        _id: report._id,
        rideId: report.rideId._id,
        userId: report.userId,
        estimatedSavings: Number(report.estimatedSavings.toFixed(2)),
        distance: Number(report.distance.toFixed(2)),
        calculatedFrom: report.calculatedFrom,
        calculationMethod: report.calculationMethod,
        carbonFactor: report.carbonFactor,
        createdAt: report.createdAt,
        ride: {
          driver: {
            _id: report.rideId.offerId.driverId._id,
            name: report.rideId.offerId.driverId.name,
            email: report.rideId.offerId.driverId.email
          },
          rider: {
            _id: report.rideId.requestId.riderId._id,
            name: report.rideId.requestId.riderId.name,
            email: report.rideId.requestId.riderId.email
          },
          route: {
            origin: report.rideId.pickupPoints[0]?.coordinates || report.rideId.origin?.coordinates,
            destination: report.rideId.dropoffPoints[0]?.coordinates || report.rideId.destination?.coordinates,
            distance: Number(report.rideId.fareSplits[0].distance.toFixed(2))
          }
        }
      },
      message: 'Emissions report retrieved successfully'
    }
  });
});

// @desc    Get user emissions history
// @route   GET /api/emissions/history
// @access  Private
const getEmissionsHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, startDate, endDate } = req.query;
  const userId = req.user._id;
  
  // Build query
  const query = { userId };
  
  // Date filtering
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        query.createdAt.$gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        query.createdAt.$lte = end;
      }
    }
  }
  
  // Calculate pagination
  const total = await EmissionsReport.countDocuments(query);
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  
  // Get emissions reports with pagination
  const reports = await EmissionsReport.find(query)
    .populate('rideId', 'offerId requestId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  // Calculate statistics
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);
  const totalDistance = reports.reduce((sum, report) => sum + report.distance, 0);
  const treesEquivalent = Number((totalSavings / 21).toFixed(3));
  
  // Format response
  const formattedReports = reports.map(report => ({
    _id: report._id,
    rideId: report.rideId._id,
    userId: report.userId,
    estimatedSavings: Number(report.estimatedSavings.toFixed(2)),
    distance: Number(report.distance.toFixed(2)),
    createdAt: report.createdAt,
    rideDetails: {
      driver: report.rideId.offerId?.driverId?.name || 'Unknown',
      rider: report.rideId.requestId?.riderId?.name || 'Unknown',
      origin: report.rideId.pickupPoints[0]?.coordinates || report.rideId.origin?.coordinates,
      destination: report.rideId.dropoffPoints[0]?.coordinates || report.rideId.destination?.coordinates
    }
  }));
  
  res.status(200).json({
    success: true,
    data: {
      reports: formattedReports,
      stats: {
        totalRides: reports.length,
        totalDistanceKm: Number(totalDistance.toFixed(2)),
        totalCo2SavedKg: Number(totalSavings.toFixed(2)),
        treesEquivalent
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: parseInt(limit)
      },
      message: `Found ${reports.length} emissions reports`
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
  const totalDistance = reports.reduce((sum, report) => sum + report.distance, 0);
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
      distance: Number(monthReports.reduce((sum, report) => sum + report.distance, 0).toFixed(2))
    });
  }
  
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

// @desc    Get ride emissions report (for drivers)
// @route   GET /api/emissions/ride/:rideId
// @access  Private
const getRideEmissions = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId;
  
  // Verify user is the driver
  const match = await Match.findById(rideId);
  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Ride not found'
    });
  }
  
  if (String(match.driverId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'You are not the driver for this ride'
    });
  }
  
  // Get all emissions reports for this ride
  const reports = await EmissionsReport.find({ rideId })
    .populate('userId', 'name email');
  
  // Calculate total emissions for the ride
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);
  const totalDistance = reports.reduce((sum, report) => sum + report.distance, 0);
  
  res.status(200).json({
    success: true,
    data: {
      rideId,
      totalSavings: Number(totalSavings.toFixed(2)),
      totalDistance: Number(totalDistance.toFixed(2)),
      reports: reports.map(report => ({
        userId: report.userId._id,
        name: report.userId.name,
        email: report.userId.email,
        estimatedSavings: Number(report.estimatedSavings.toFixed(2)),
        distance: Number(report.distance.toFixed(2)),
        createdAt: report.createdAt
      })),
      message: 'Ride emissions report retrieved successfully'
    }
  });
});

module.exports = {
  getEmissionsReport,
  getEmissionsHistory,
  getEmissionsStats,
  getRideEmissions
};
