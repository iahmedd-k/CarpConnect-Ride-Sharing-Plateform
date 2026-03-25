const turf = require('@turf/turf');
const h3 = require('h3-js');
const geolib = require('geolib');

// Calculate route distance in meters
const calculateRouteDistance = (geojson) => {
  const coordinates = geojson?.coordinates || geojson?.geometry?.coordinates;
  if (!coordinates) {
    return 0;
  }
  
  try {
    const line = turf.lineString(coordinates);
    const km = turf.length(line, { units: 'kilometers' });
    const meters = Number(km) * 1000;
    return Number.isFinite(meters) ? meters : 0;
  } catch (error) {
    console.error('Error calculating route distance:', error);
    return 0;
  }
};

// Calculate route duration in minutes
const calculateRouteDuration = (geojson, options = {}) => {
  const { 
    averageSpeed = 40, // km/h
    trafficMultiplier = 1.0
  } = options;
  
  const distanceKm = calculateRouteDistance(geojson) / 1000;
  if (distanceKm === 0) return 0;
  
  // Calculate time in minutes
  const timeHours = (distanceKm / averageSpeed) * trafficMultiplier;
  return timeHours * 60;
};

// Get H3 hexagons for a route (for spatial indexing)
const getRouteHexagons = (geojson, resolution = 9) => {
  if (!geojson || !geojson.coordinates) {
    return [];
  }
  
  // Add more detailed hexagons for better spatial queries
  const hexagons = new Set();
  
  // Add hexagons for all route points
  geojson.coordinates.forEach(coord => {
    const hex = h3.geoToH3(coord[1], coord[0], resolution);
    hexagons.add(hex);
    
    // Add nearby hexagons for better coverage
    h3.kRing(hex, 1).forEach(h => hexagons.add(h));
  });
  
  return Array.from(hexagons);
};

// Calculate route deviation (how much the route changes with new pickup/dropoff)
const calculateRouteDeviation = (originalRoute, newRoute) => {
  if (!originalRoute || !newRoute) {
    return 0;
  }
  
  const originalDistance = calculateRouteDistance(originalRoute);
  const newDistance = calculateRouteDistance(newRoute);
  
  if (originalDistance === 0) return 0;
  
  // Calculate deviation as a percentage of the original route
  return Math.min(1, Math.max(0, (newDistance - originalDistance) / originalDistance));
};

// Find nearest point on route
const findNearestPointOnRoute = (routeCoordinates, point) => {
  if (!routeCoordinates || routeCoordinates.length === 0 || !point) {
    return null;
  }
  
  const routeLine = turf.lineString(routeCoordinates);
  const targetPoint = turf.point(point);
  
  try {
    const nearestPoint = turf.nearestPointOnLine(routeLine, targetPoint);
    return {
      coordinates: [nearestPoint.geometry.coordinates[0], nearestPoint.geometry.coordinates[1]],
      distance: nearestPoint.properties.dist,
      index: nearestPoint.properties.index
    };
  } catch (error) {
    console.error('Error finding nearest point:', error);
    return null;
  }
};

// Calculate the shortest distance from a point to a route in meters
const calculatePointToRouteDistance = (routeCoordinates, point) => {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2 || !Array.isArray(point) || point.length !== 2) {
    return Infinity;
  }

  try {
    const routeLine = turf.lineString(routeCoordinates);
    const targetPoint = turf.point(point);
    const distanceKm = turf.pointToLineDistance(targetPoint, routeLine, { units: 'kilometers' });
    return Number(distanceKm) * 1000;
  } catch (error) {
    console.error('Error calculating point-to-route distance:', error);
    return Infinity;
  }
};

// Optimize route with multiple stops
const optimizeRouteWithStops = (baseRoute, stops, options = {}) => {
  const {
    maxDetourPercentage = 0.2, // 20% maximum detour
    maxStops = 5,
    trafficData = null
  } = options;
  
  // Clone base route coordinates
  const optimizedRoute = [...baseRoute.coordinates];
  
  // Add stops in optimal order
  let remainingStops = [...stops];
  let currentPoint = baseRoute.coordinates[0];
  
  // Process up to maxStops
  for (let i = 0; i < Math.min(maxStops, stops.length); i++) {
    if (remainingStops.length === 0) break;
    
    // Find the closest stop to current point
    const closestStop = remainingStops.reduce((closest, stop) => {
      const distance = geolib.getDistance(
        { latitude: currentPoint[1], longitude: currentPoint[0] },
        { latitude: stop.coordinates[1], longitude: stop.coordinates[0] }
      );
      
      return closest === null || distance < closest.distance
        ? { stop, distance }
        : closest;
    }, null);
    
    if (closestStop) {
      // Calculate detour distance
      const originalDistance = geolib.getDistance(
        { latitude: currentPoint[1], longitude: currentPoint[0] },
        { latitude: baseRoute.coordinates[baseRoute.coordinates.length-1][1], longitude: baseRoute.coordinates[baseRoute.coordinates.length-1][0] }
      );
      
      const newDistance = geolib.getDistance(
        { latitude: currentPoint[1], longitude: currentPoint[0] },
        { latitude: closestStop.stop.coordinates[1], longitude: closestStop.stop.coordinates[0] }
      ) + geolib.getDistance(
        { latitude: closestStop.stop.coordinates[1], longitude: closestStop.stop.coordinates[0] },
        { latitude: baseRoute.coordinates[baseRoute.coordinates.length-1][1], longitude: baseRoute.coordinates[baseRoute.coordinates.length-1][0] }
      );
      
      // Only add stop if within detour limit
      if ((newDistance - originalDistance) / originalDistance <= maxDetourPercentage) {
        // Insert stop into route
        const insertIndex = optimizedRoute.findIndex(point => 
          point[0] === currentPoint[0] && point[1] === currentPoint[1]
        );
        
        if (insertIndex !== -1) {
          optimizedRoute.splice(insertIndex + 1, 0, closestStop.stop.coordinates);
        }
        
        // Update current point
        currentPoint = closestStop.stop.coordinates;
        remainingStops = remainingStops.filter(s => s !== closestStop.stop);
      }
    }
  }
  
  return {
    coordinates: optimizedRoute,
    stops: stops.filter(stop => 
      remainingStops.every(s => s !== stop)
    )
  };
};

// Calculate route with traffic data
const calculateRouteWithTraffic = (geojson, trafficData) => {
  if (!trafficData) {
    return calculateRouteDuration(geojson);
  }
  
  const coordinates = geojson?.coordinates || geojson?.geometry?.coordinates;
  if (!coordinates) {
    return 0;
  }
  
  // Calculate segment-by-segment duration based on traffic
  let totalDuration = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segment = [coordinates[i], coordinates[i+1]];
    const segmentDistance = calculateRouteDistance({
      coordinates: segment
    });
    
    // Find traffic speed for this segment
    const speed = trafficData.getSegmentSpeed(segment) || 40; // Default 40 km/h
    
    // Calculate time for this segment
    const time = (segmentDistance / 1000) / speed * 60; // Minutes
    totalDuration += time;
  }
  
  return totalDuration;
};

// Find all routes within a distance
const findRoutesInRadius = (center, radiusMeters, allRoutes, options = {}) => {
  const { 
    resolution = 9,
    maxResults = 10
  } = options;
  
  // Convert radius to H3 hexagons
  const centerHex = h3.geoToH3(center[1], center[0], resolution);
  const hexagons = h3.kRing(centerHex, Math.ceil(radiusMeters / 1000));
  
  // Filter routes that intersect with these hexagons
  return allRoutes.filter(route => {
    const routeHexagons = getRouteHexagons(route, resolution);
    return routeHexagons.some(hex => hexagons.includes(hex));
  }).slice(0, maxResults);
};

// Calculate route with pickup/dropoff optimization
const optimizePickupDropoff = (route, pickupPoints, dropoffPoints) => {
  if (!pickupPoints || !dropoffPoints) {
    return route;
  }
  
  // Find the best points to insert pickup and dropoff
  const bestPickup = pickupPoints.reduce((best, point) => {
    const result = findNearestPointOnRoute(route.coordinates, point);
    if (!result) return best;
    
    return best === null || result.distance < best.distance
      ? { point, ...result }
      : best;
  }, null);
  
  const bestDropoff = dropoffPoints.reduce((best, point) => {
    const result = findNearestPointOnRoute(route.coordinates, point);
    if (!result) return best;
    
    return best === null || result.distance < best.distance
      ? { point, ...result }
      : best;
  }, null);
  
  if (!bestPickup || !bestDropoff) {
    return route;
  }
  
  // Create new route with optimized points
  const optimizedRoute = [...route.coordinates];
  
  // Insert pickup point
  if (bestPickup.index !== undefined) {
    optimizedRoute.splice(bestPickup.index + 1, 0, bestPickup.coordinates);
  }
  
  // Insert dropoff point
  if (bestDropoff.index !== undefined) {
    optimizedRoute.splice(bestDropoff.index + 1, 0, bestDropoff.coordinates);
  }
  
  return {
    ...route,
    coordinates: optimizedRoute,
    pickupPoint: bestPickup,
    dropoffPoint: bestDropoff
  };
};

module.exports = {
  calculateRouteDistance,
  calculateRouteDuration,
  getRouteHexagons,
  calculateRouteDeviation,
  calculatePointToRouteDistance,
  findNearestPointOnRoute,
  optimizeRouteWithStops,
  calculateRouteWithTraffic,
  findRoutesInRadius,
  optimizePickupDropoff
};
