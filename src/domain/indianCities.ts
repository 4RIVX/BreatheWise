export interface IndianCityPreset {
  id: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  cpcbSearchCity: string;
}

export const INDIAN_STATES: string[] = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Delhi",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
];

export const INDIAN_CITY_PRESETS: IndianCityPreset[] = [
  {
    id: "delhi",
    city: "Delhi",
    state: "Delhi",
    latitude: 28.6139,
    longitude: 77.209,
    cpcbSearchCity: "Delhi",
  },
  {
    id: "chennai",
    city: "Chennai",
    state: "Tamil Nadu",
    latitude: 13.0827,
    longitude: 80.2707,
    cpcbSearchCity: "Chennai",
  },
  {
    id: "mumbai",
    city: "Mumbai",
    state: "Maharashtra",
    latitude: 19.076,
    longitude: 72.8777,
    cpcbSearchCity: "Mumbai",
  },
  {
    id: "bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    latitude: 12.9716,
    longitude: 77.5946,
    cpcbSearchCity: "Bengaluru",
  },
  {
    id: "kolkata",
    city: "Kolkata",
    state: "West Bengal",
    latitude: 22.5726,
    longitude: 88.3639,
    cpcbSearchCity: "Kolkata",
  },
  {
    id: "hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    latitude: 17.385,
    longitude: 78.4867,
    cpcbSearchCity: "Hyderabad",
  },
  {
    id: "pune",
    city: "Pune",
    state: "Maharashtra",
    latitude: 18.5204,
    longitude: 73.8567,
    cpcbSearchCity: "Pune",
  },
  {
    id: "ahmedabad",
    city: "Ahmedabad",
    state: "Gujarat",
    latitude: 23.0225,
    longitude: 72.5714,
    cpcbSearchCity: "Ahmedabad",
  },
  {
    id: "lucknow",
    city: "Lucknow",
    state: "Uttar Pradesh",
    latitude: 26.8467,
    longitude: 80.9462,
    cpcbSearchCity: "Lucknow",
  },
  {
    id: "patna",
    city: "Patna",
    state: "Bihar",
    latitude: 25.5941,
    longitude: 85.1376,
    cpcbSearchCity: "Patna",
  },
  {
    id: "jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    latitude: 26.9124,
    longitude: 75.7873,
    cpcbSearchCity: "Jaipur",
  },
  {
    id: "gurugram",
    city: "Gurugram",
    state: "Haryana",
    latitude: 28.4595,
    longitude: 77.0266,
    cpcbSearchCity: "Gurugram",
  },
  {
    id: "noida",
    city: "Noida",
    state: "Uttar Pradesh",
    latitude: 28.5355,
    longitude: 77.391,
    cpcbSearchCity: "Noida",
  },
  {
    id: "coimbatore",
    city: "Coimbatore",
    state: "Tamil Nadu",
    latitude: 11.0168,
    longitude: 76.9558,
    cpcbSearchCity: "Coimbatore",
  },
  {
    id: "madurai",
    city: "Madurai",
    state: "Tamil Nadu",
    latitude: 9.9252,
    longitude: 78.1198,
    cpcbSearchCity: "Madurai",
  },
  {
    id: "kochi",
    city: "Kochi",
    state: "Kerala",
    latitude: 9.9312,
    longitude: 76.2673,
    cpcbSearchCity: "Kochi",
  },
  {
    id: "chandigarh",
    city: "Chandigarh",
    state: "Chandigarh",
    latitude: 30.7333,
    longitude: 76.7794,
    cpcbSearchCity: "Chandigarh",
  },
  {
    id: "kanpur",
    city: "Kanpur",
    state: "Uttar Pradesh",
    latitude: 26.4499,
    longitude: 80.3319,
    cpcbSearchCity: "Kanpur",
  },
  {
    id: "varanasi",
    city: "Varanasi",
    state: "Uttar Pradesh",
    latitude: 25.3176,
    longitude: 82.9739,
    cpcbSearchCity: "Varanasi",
  },
  {
    id: "guwahati",
    city: "Guwahati",
    state: "Assam",
    latitude: 26.1445,
    longitude: 91.7362,
    cpcbSearchCity: "Guwahati",
  },
  {
    id: "bhopal",
    city: "Bhopal",
    state: "Madhya Pradesh",
    latitude: 23.2599,
    longitude: 77.4126,
    cpcbSearchCity: "Bhopal",
  },
  {
    id: "visakhapatnam",
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    latitude: 17.6868,
    longitude: 83.2185,
    cpcbSearchCity: "Visakhapatnam",
  },
];

export function findCityPreset(
  query: string,
  stateFilter?: string
): IndianCityPreset[] {
  const q = query.trim().toLowerCase();
  return INDIAN_CITY_PRESETS.filter((item) => {
    if (stateFilter && stateFilter !== "All" && item.state !== stateFilter) {
      return false;
    }
    if (!q) return true;
    return (
      item.city.toLowerCase().includes(q) ||
      item.state.toLowerCase().includes(q)
    );
  });
}
