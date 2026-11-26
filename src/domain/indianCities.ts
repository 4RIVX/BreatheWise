export interface IndianCityPreset {
  id: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
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
  },
  {
    id: "chennai",
    city: "Chennai",
    state: "Tamil Nadu",
    latitude: 13.0827,
    longitude: 80.2707,
  },
  {
    id: "mumbai",
    city: "Mumbai",
    state: "Maharashtra",
    latitude: 19.076,
    longitude: 72.8777,
  },
  {
    id: "bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    latitude: 12.9716,
    longitude: 77.5946,
  },
  {
    id: "kolkata",
    city: "Kolkata",
    state: "West Bengal",
    latitude: 22.5726,
    longitude: 88.3639,
  },
  {
    id: "hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    latitude: 17.385,
    longitude: 78.4867,
  },
  {
    id: "pune",
    city: "Pune",
    state: "Maharashtra",
    latitude: 18.5204,
    longitude: 73.8567,
  },
  {
    id: "ahmedabad",
    city: "Ahmedabad",
    state: "Gujarat",
    latitude: 23.0225,
    longitude: 72.5714,
  },
  {
    id: "lucknow",
    city: "Lucknow",
    state: "Uttar Pradesh",
    latitude: 26.8467,
    longitude: 80.9462,
  },
  {
    id: "patna",
    city: "Patna",
    state: "Bihar",
    latitude: 25.5941,
    longitude: 85.1376,
  },
  {
    id: "jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    latitude: 26.9124,
    longitude: 75.7873,
  },
  {
    id: "gurugram",
    city: "Gurugram",
    state: "Haryana",
    latitude: 28.4595,
    longitude: 77.0266,
  },
  {
    id: "noida",
    city: "Noida",
    state: "Uttar Pradesh",
    latitude: 28.5355,
    longitude: 77.391,
  },
  {
    id: "coimbatore",
    city: "Coimbatore",
    state: "Tamil Nadu",
    latitude: 11.0168,
    longitude: 76.9558,
  },
  {
    id: "madurai",
    city: "Madurai",
    state: "Tamil Nadu",
    latitude: 9.9252,
    longitude: 78.1198,
  },
  {
    id: "kochi",
    city: "Kochi",
    state: "Kerala",
    latitude: 9.9312,
    longitude: 76.2673,
  },
  {
    id: "chandigarh",
    city: "Chandigarh",
    state: "Chandigarh",
    latitude: 30.7333,
    longitude: 76.7794,
  },
  {
    id: "kanpur",
    city: "Kanpur",
    state: "Uttar Pradesh",
    latitude: 26.4499,
    longitude: 80.3319,
  },
  {
    id: "varanasi",
    city: "Varanasi",
    state: "Uttar Pradesh",
    latitude: 25.3176,
    longitude: 82.9739,
  },
  {
    id: "guwahati",
    city: "Guwahati",
    state: "Assam",
    latitude: 26.1445,
    longitude: 91.7362,
  },
  {
    id: "bhopal",
    city: "Bhopal",
    state: "Madhya Pradesh",
    latitude: 23.2599,
    longitude: 77.4126,
  },
  {
    id: "visakhapatnam",
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    latitude: 17.6868,
    longitude: 83.2185,
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
