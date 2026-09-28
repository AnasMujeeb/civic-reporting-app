const { validateKarachiBounds } = require('../utils/geofenceHelper');

const KARACHI_UCS = [
  {
    id: 'UC-01',
    ucNumber: 'UC-01',
    name: 'PECHS / Jamshed Town',
    district: 'District East',
    zone: 'East Zone',
    latitude: 24.8716,
    longitude: 67.0599,
    keywords: ['pechs', 'tariq road', 'jamshed', 'bahadurabad', 'shahrah-e-faisal', 'kashmir road', 'society'],
  },
  {
    id: 'UC-02',
    ucNumber: 'UC-02',
    name: 'Saddar / Civil Lines',
    district: 'District South',
    zone: 'South Zone',
    latitude: 24.8560,
    longitude: 67.0149,
    keywords: ['saddar', 'civil lines', 'cantt', 'burns road', 'preedy', 'ii chundrigar', 'kharadar', 'empress market'],
  },
  {
    id: 'UC-03',
    ucNumber: 'UC-03',
    name: 'Liaquatabad / Nazimabad',
    district: 'District Central',
    zone: 'Central Zone',
    latitude: 24.9089,
    longitude: 67.0425,
    keywords: ['liaquatabad', 'lalukhet', 'nazimabad', 'dak khana', 'teen hatti', 'super market'],
  },
  {
    id: 'UC-04',
    ucNumber: 'UC-04',
    name: 'Gulshan-e-Iqbal',
    district: 'District East',
    zone: 'East Zone',
    latitude: 24.9180,
    longitude: 67.0971,
    keywords: ['gulshan', 'iqbal', 'university road', 'hassan square', 'nipa', 'gulistan-e-jauhar', 'jauhar', 'block 13', 'block 6', 'samama', 'rashid minhas'],
  },
  {
    id: 'UC-05',
    ucNumber: 'UC-05',
    name: 'Gulberg / Federal B Area',
    district: 'District Central',
    zone: 'Central Zone',
    latitude: 24.9350,
    longitude: 67.0680,
    keywords: ['gulberg', 'f.b area', 'fb area', 'federal b area', 'water pump', 'ayesha manzil', 'yaseenabad', 'dastagir'],
  },
  {
    id: 'UC-07',
    ucNumber: 'UC-07',
    name: 'North Nazimabad',
    district: 'District Central',
    zone: 'Central Zone',
    latitude: 24.9450,
    longitude: 67.0450,
    keywords: ['north nazimabad', 'hyderi', 'sakhi hassan', 'five star', 'kda', 'shadman', 'bufferzone'],
  },
  {
    id: 'UC-09',
    ucNumber: 'UC-09',
    name: 'Shah Faisal Town',
    district: 'District Korangi',
    zone: 'Shah Faisal Zone',
    latitude: 24.8770,
    longitude: 67.1400,
    keywords: ['shah faisal', 'shah faisal town', 'drigh road', 'natha khan', 'green town', 'faisal cantt', 'morio khan', 'gulistan-e-faisal', 'al-falah', 'shama'],
  },
  {
    id: 'UC-11',
    ucNumber: 'UC-11',
    name: 'Clifton / DHA',
    district: 'District South',
    zone: 'South Zone',
    latitude: 24.8210,
    longitude: 67.0340,
    keywords: ['clifton', 'dha', 'defence', 'boat basin', 'seaview', 'bath island', 'zamzama', 'gizri', 'phase'],
  },
  {
    id: 'UC-12',
    ucNumber: 'UC-12',
    name: 'Keamari / Harbor',
    district: 'District Keamari',
    zone: 'Keamari Zone',
    latitude: 24.8150,
    longitude: 66.9750,
    keywords: ['keamari', 'harbor', 'mauripur', 'machar colony', 'port', 'dockyard', 'manora'],
  },
  {
    id: 'UC-14',
    ucNumber: 'UC-14',
    name: 'Korangi / Landhi',
    district: 'District Korangi',
    zone: 'Korangi Zone',
    latitude: 24.8320,
    longitude: 67.1350,
    keywords: ['korangi', 'landhi', 'dar-us-salam', 'brookes', 'industrial area', 'zaman town', 'crossing'],
  },
  {
    id: 'UC-18',
    ucNumber: 'UC-18',
    name: 'North Karachi / Surjani',
    district: 'District Central',
    zone: 'Central Zone',
    latitude: 24.9850,
    longitude: 67.0650,
    keywords: ['north karachi', 'surjani', 'new karachi', '4k', 'nagan chowrangi', 'powerhouse', 'up mor'],
  },
  {
    id: 'UC-22',
    ucNumber: 'UC-22',
    name: 'Malir / Model Colony',
    district: 'District Malir',
    zone: 'Malir Zone',
    latitude: 24.8900,
    longitude: 67.1850,
    keywords: ['model colony', 'malir', 'khokarapar', 'safoora', 'kala board', 'airport', 'malir cantt', 'liaquat market'],
  },
  {
    id: 'UC-25',
    ucNumber: 'UC-25',
    name: 'SITE / Orangi Town',
    district: 'District West',
    zone: 'West Zone',
    latitude: 24.9200,
    longitude: 66.9800,
    keywords: ['site', 'orangi', 'banaras', 'metroville', 'valika', 'manghopir', 'qasba colony', 'west'],
  },
];

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

exports.reverseGeocode = async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat || req.query.latitude);
    const lng = parseFloat(req.query.lng || req.query.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude (lat) and longitude (lng) query parameters are required.',
      });
    }

    const boundsCheck = validateKarachiBounds(lat, lng);
    if (!boundsCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: boundsCheck.message,
      });
    }

    // Find nearest UC by distance
    let nearestUc = KARACHI_UCS[0];
    let minDistance = Infinity;

    for (const uc of KARACHI_UCS) {
      const dist = calculateDistanceKm(lat, lng, uc.latitude, uc.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestUc = uc;
      }
    }

    const derivedAddress = `${nearestUc.name}, ${nearestUc.district}, Karachi`;

    res.status(200).json({
      success: true,
      data: {
        address: derivedAddress,
        street: nearestUc.name,
        district: nearestUc.district,
        zone: nearestUc.zone,
        ucId: nearestUc.id,
        ucNumber: nearestUc.ucNumber,
        name: nearestUc.name,
        formattedLocation: `${nearestUc.id} (${nearestUc.name}, ${nearestUc.district})`,
        coordinates: {
          latitude: lat,
          longitude: lng,
        },
        distanceKm: parseFloat(minDistance.toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
};
