export type UiLanguage = "en" | "ta";

export interface TranslationBundle {
  brand: string;
  tagline: string;
  nav: {
    dashboard: string;
    guardian: string;
    indoor: string;
    mobility: string;
    smogWatch: string;
    planner: string;
  };
  actions: {
    reportSmog: string;
    signInGoogle: string;
    signOut: string;
    useMyLocation: string;
    refreshData: string;
    refreshGuidance: string;
    askAi: string;
  };
  sections: {
    dashboardTitle: string;
    dashboardSubtitle: string;
    measuredStationLabel: string;
    openAqStationLabel: string;
    modelledForecastLabel: string;
    indianAqiTitle: string;
    guardianTitle: string;
    plannerTitle: string;
    indoorTitle: string;
    mobilityTitle: string;
    routinesTitle: string;
    smogWatchTitle: string;
  };
  disclaimers: {
    unverifiedReports: string;
    modelledVsMeasured: string;
    medicalNote: string;
  };
}

export const TRANSLATIONS: Record<UiLanguage, TranslationBundle> = {
  en: {
    brand: "BreatheWise",
    tagline: "Understand Your Air. Protect Your People. Breathe Better.",
    nav: {
      dashboard: "Air Quality",
      guardian: "AI Guardian",
      planner: "Daily Plan",
      indoor: "Indoor Coach",
      mobility: "Eco & Mobility",
      smogWatch: "Smog Watch",
    },
    actions: {
      reportSmog: "Report Smog",
      signInGoogle: "Sign in with Google",
      signOut: "Sign out",
      useMyLocation: "Use my location",
      refreshData: "Refresh Readings",
      refreshGuidance: "Refresh AI Guidance",
      askAi: "Ask",
    },
    sections: {
      dashboardTitle: "Air Quality Intelligence Dashboard",
      dashboardSubtitle:
        "India-first air quality monitoring separating ground station measurements (CPCB or OpenAQ hourly) from Open-Meteo regional modelled forecasts.",
      measuredStationLabel: "Official Monitoring Station (CPCB / data.gov.in)",
      openAqStationLabel:
        "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology",
      modelledForecastLabel: "Modelled Regional Forecast (Open-Meteo)",
      indianAqiTitle: "Official Indian National AQI (CPCB Methodology)",
      guardianTitle: "AI Family Guardian",
      plannerTitle: "Personalized Daily Protection Planner",
      indoorTitle: "Indoor Air Coach",
      mobilityTitle: "Smart Mobility & Eco Impact Tracker",
      routinesTitle: "Low-Emission Daily Routines",
      smogWatchTitle: "Community Smog Watch",
    },
    disclaimers: {
      unverifiedReports:
        "Citizen observations are labelled UNVERIFIED until reviewed and never replace official monitoring station measurements.",
      modelledVsMeasured:
        "Modelled regional forecasts are atmospheric simulations and are always displayed separately from official monitoring-station measurements.",
      medicalNote:
        "Environmental guidance is informational only. Do not alter prescribed medication; seek urgent medical care for severe breathlessness, wheezing, or chest pain.",
    },
  },
  ta: {
    brand: "BreatheWise",
    tagline: "உங்கள் காற்றை அறியுங்கள். குடும்பத்தைக் காப்போம். நலமுடன் சுவாசிப்போம்.",
    nav: {
      dashboard: "காற்று தரம்",
      guardian: "AI வழிகாட்டி",
      planner: "தினசரி திட்டம்",
      indoor: "உள்ளக காற்று",
      mobility: "பயணத் தாக்கம்",
      smogWatch: "புகைப் புகார்",
    },
    actions: {
      reportSmog: "புகை புகார்",
      signInGoogle: "Google உள்நுழைவு",
      signOut: "வெளியேறு",
      useMyLocation: "என் இருப்பிடம்",
      refreshData: "தரவைப் புதுப்பி",
      refreshGuidance: "AI ஆலோசனை புதுப்பி",
      askAi: "கேள்",
    },
    sections: {
      dashboardTitle: "காற்று தர நுண்ணறிவு முகப்பு",
      dashboardSubtitle:
        "நிலைய அளவீடுகள் (CPCB அல்லது OpenAQ மணிநேரத் தரவு) மற்றும் Open-Meteo பிராந்திய கணிப்புகளைத் தனித்தனியாகக் காட்டும் இந்திய காற்று தர தளம்.",
      measuredStationLabel: "அதிகாரப்பூர்வ அளவீட்டு நிலையம் (CPCB / data.gov.in)",
      openAqStationLabel: "OpenAQ மணிநேர அளவீடுகள் — CPCB முறையில் கணக்கிடப்பட்ட AQI",
      modelledForecastLabel: "மாதிரி பிராந்திய கணிப்பு (Open-Meteo)",
      indianAqiTitle: "இந்திய தேசிய AQI கணக்கீடு (CPCB முறை)",
      guardianTitle: "AI குடும்பப் பாதுகாவலர்",
      plannerTitle: "தனிப்பயன் தினசரி பாதுகாப்பு திட்டம்",
      indoorTitle: "உள்ளக காற்று பயிற்சியாளர் (CADR & ACH)",
      mobilityTitle: "பசுமைப் பயண மற்றும் கார்பன் சேமிப்பு கணிப்பான்",
      routinesTitle: "குறைந்த உமிழ்வு தினசரி பழக்கங்கள்",
      smogWatchTitle: "சமூகப் புகை கண்காணிப்பு",
    },
    disclaimers: {
      unverifiedReports:
        "மக்கள் பதிவுகள் சரிபார்க்கப்படும் வரை UNVERIFIED எனக் குறிக்கப்படும்; இவை அதிகாரப்பூர்வ நிலைய அளவீடுகளுக்கு மாற்றல்ல.",
      modelledVsMeasured:
        "Open-Meteo கணிப்புகள் வளிமண்டல மாதிரி மதிப்பீடுகள் மட்டுமே; அதிகாரப்பூர்வ CPCB நிலைய அளவீடுகளிலிருந்து தனித்தே காட்டப்படும்.",
      medicalNote:
        "இங்குள்ள ஆலோசனைகள் தகவல் நோக்கத்திற்கு மட்டுமே. மருத்துவர் பரிந்துரைத்த மருந்துகளை மாற்றாதீர்கள்; மூச்சுத்திணறல் அல்லது நெஞ்சுவலி இருந்தால் உடனே மருத்துவ உதவி பெறுங்கள்.",
    },
  },
};
