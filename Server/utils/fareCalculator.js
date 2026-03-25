// Calculate fare based on distance, time, vehicle type, and other factors
const calculateFare = (distance, options = {}) => {
  const {
    city = 'lahore',
    time = new Date(),
    vehicleType = 'car',
    isRushHour = false,
    isPremium = false,
    baseFare = 2,
    perKmRate = 0.5,
    timeMultiplier = 1.2,
    demandMultiplier = 1.0
  } = options;

  // Convert meters to kilometers
  const km = distance / 1000;
  
  // City-specific adjustments
  const cityAdjustments = {
    'islamabad': { baseFare: 2.5, perKmRate: 0.55 },
    'lahore': { baseFare: 2.0, perKmRate: 0.5 },
    'karachi': { baseFare: 1.8, perKmRate: 0.45 },
    'faisalabad': { baseFare: 1.7, perKmRate: 0.4 },
    'peshawar': { baseFare: 1.6, perKmRate: 0.35 }
  };
  
  const cityAdjustment = cityAdjustments[city.toLowerCase()] || cityAdjustments.lahore;
  
  // Vehicle type adjustments
  const vehicleAdjustments = {
    'electric': { baseFareMultiplier: 0.9, perKmMultiplier: 0.8 },
    'hybrid': { baseFareMultiplier: 0.95, perKmMultiplier: 0.9 },
    'car': { baseFareMultiplier: 1.0, perKmMultiplier: 1.0 },
    'bus': { baseFareMultiplier: 1.1, perKmMultiplier: 1.2 }
  };
  
  const vehicleAdjustment = vehicleAdjustments[vehicleType] || vehicleAdjustments.car;
  
  // Time-based adjustments
  const hour = time.getHours();
  const rushHourCalculated = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const timeAdjustment = rushHourCalculated ? 1.3 : 1.0;
  
  // Demand-based adjustments
  const demandAdjustment = Math.min(2.0, Math.max(0.7, demandMultiplier));
  
  // Calculate base fare + per km rate with all adjustments
  let fare = 
    (baseFare * cityAdjustment.baseFare * vehicleAdjustment.baseFareMultiplier) + 
    (km * perKmRate * cityAdjustment.perKmRate * vehicleAdjustment.perKmMultiplier);
  
  // Apply time and demand multipliers
  fare *= timeAdjustment;
  fare *= demandAdjustment;
  
  // Apply premium service adjustment
  if (isPremium) {
    fare *= 1.2;
  }
  
  // Round to 2 decimal places
  return parseFloat(fare.toFixed(2));
};

// Split fare among riders based on their segments and preferences
const splitFare = (totalFare, segments) => {
  if (!segments || segments.length === 0) {
    return [];
  }
  
  // Total distance of the entire route
  const totalDistance = segments.reduce((sum, segment) => 
    sum + Number(segment.distance || 0), 0);
  
  // Calculate each rider's share based on distance, time, and preferences
  return segments.map(segment => {
    const distance = Number(segment.distance || 0);
    let shareFactor = 1.0;
    
    // Apply distance-based weighting
    const distanceFactor = distance / totalDistance;
    
    // Apply time-based adjustment (e.g., if they're traveling during rush hour)
    if (segment.isRushHour) {
      shareFactor *= 1.2;
    }
    
    // Apply preference adjustments (e.g., smoking allowed, pets allowed)
    if (segment.preferences?.smoking) {
      shareFactor *= 0.95; // Small discount for flexibility
    }
    
    if (segment.preferences?.pets) {
      shareFactor *= 1.05; // Small premium for pet-friendly rides
    }
    
    // Calculate final share
    const share = totalFare * (distanceFactor * shareFactor);
    return {
      riderId: segment.riderId,
      amount: parseFloat(share.toFixed(2)),
      distance,
      shareFactor,
      breakdown: {
        distanceFactor,
        timeAdjustment: segment.isRushHour ? 1.2 : 1.0,
        preferenceAdjustments: {
          smoking: segment.preferences?.smoking ? 0.95 : 1.0,
          pets: segment.preferences?.pets ? 1.05 : 1.0
        }
      }
    };
  });
};

// Calculate emissions savings with vehicle-specific data
const calculateEmissionsSavings = (distance, options = {}) => {
  const {
    vehicleType = 'car',
    fuelType = 'petrol',
    routeType = 'city',
    passengerCount = 1
  } = options;
  
  // Emissions factors (kg CO2 per km)
  const emissionsFactors = {
    // City driving (stop-and-go traffic)
    city: {
      petrol: {
        car: 0.171,
        hybrid: 0.12,
        electric: 0.0
      },
      diesel: {
        car: 0.145,
        bus: 0.25
      }
    },
    // Highway driving (more efficient)
    highway: {
      petrol: {
        car: 0.15,
        hybrid: 0.11,
        electric: 0.0
      },
      diesel: {
        car: 0.13,
        bus: 0.22
      }
    }
  };
  
  // Standard emissions for a solo trip (1.5 passengers on average)
  const soloPassengers = 1.5;
  
  // Calculate emissions for solo trip vs carpool
  const emissionsPerKm = emissionsFactors[routeType][fuelType][vehicleType] || 
                         emissionsFactors.city.petrol.car;
  
  const soloEmissions = distance * emissionsPerKm * soloPassengers;
  const carpoolEmissions = distance * emissionsPerKm;
  
  return {
    estimatedSavings: parseFloat((soloEmissions - carpoolEmissions).toFixed(2)),
    soloEmissions: parseFloat(soloEmissions.toFixed(2)),
    carpoolEmissions: parseFloat(carpoolEmissions.toFixed(2)),
    treesEquivalent: parseFloat(((soloEmissions - carpoolEmissions) / 21).toFixed(3)),
    routeType,
    vehicleType,
    fuelType,
    passengerCount
  };
};

// Calculate dynamic pricing factors
const calculatePricingFactors = (options = {}) => {
  const {
    city = 'lahore',
    time = new Date(),
    vehicleType = 'car',
    demandLevel = 1.0
  } = options;
  
  // City-specific pricing factors
  const cityFactors = {
    'islamabad': { baseFare: 2.5, perKmRate: 0.55 },
    'lahore': { baseFare: 2.0, perKmRate: 0.5 },
    'karachi': { baseFare: 1.8, perKmRate: 0.45 },
    'faisalabad': { baseFare: 1.7, perKmRate: 0.4 },
    'peshawar': { baseFare: 1.6, perKmRate: 0.35 }
  };
  
  // Time-based factors (rush hour)
  const hour = time.getHours();
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const timeFactor = isRushHour ? 1.3 : 1.0;
  
  // Demand-based factors
  const demandFactor = Math.min(2.0, Math.max(0.7, demandLevel));
  
  // Return all factors for transparency
  return {
    city: city,
    baseFare: cityFactors[city.toLowerCase()]?.baseFare || 2.0,
    perKmRate: cityFactors[city.toLowerCase()]?.perKmRate || 0.5,
    timeFactor,
    isRushHour,
    demandFactor,
    finalMultiplier: timeFactor * demandFactor
  };
};

module.exports = {
  calculateFare,
  splitFare,
  calculateEmissionsSavings,
  calculatePricingFactors
};
