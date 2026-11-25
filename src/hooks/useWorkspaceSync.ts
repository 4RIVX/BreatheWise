import { useCallback, useState } from "react";
import type { User } from "firebase/auth";
import type { ActiveLocationState } from "../domain/airQualityTypes";
import { useHouseholdPreferences } from "./useHouseholdPreferences";
import { useRoutinesSync } from "./useRoutinesSync";
import { useSmogReports } from "./useSmogReports";
import { useEcoLogsSync } from "./useEcoLogsSync";

export function useWorkspaceSync(params: {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  activeLocation: ActiveLocationState;
}) {
  const { user, authReady, firebaseEnabled, activeLocation } = params;
  const [syncError, setSyncError] = useState<string | null>(null);

  const reportSyncError = useCallback((message: string | null) => {
    setSyncError(message);
  }, []);

  const dismissSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  const {
    household,
    savingProfile,
    handleHouseholdChange,
    handleLanguageChange,
  } = useHouseholdPreferences({
    user,
    authReady,
    firebaseEnabled,
    activeLocation,
    onError: reportSyncError,
  });

  const { activeRoutines, handleToggleRoutine, handleAddRoutine } =
    useRoutinesSync({
      user,
      authReady,
      firebaseEnabled,
      onError: reportSyncError,
    });

  const {
    smogReports,
    confirmedReportIds,
    handleCreateSmogReport,
    handleConfirmSmogReport,
  } = useSmogReports({
    user,
    firebaseEnabled,
    onError: reportSyncError,
  });

  const { ecoLogs, handleSaveTripLog } = useEcoLogsSync({
    user,
    authReady,
    firebaseEnabled,
    onError: reportSyncError,
  });

  return {
    household,
    activeRoutines,
    ecoLogs,
    smogReports,
    confirmedReportIds,
    savingProfile,
    syncError,
    dismissSyncError,
    handleHouseholdChange,
    handleLanguageChange,
    handleToggleRoutine,
    handleAddRoutine,
    handleCreateSmogReport,
    handleConfirmSmogReport,
    handleSaveTripLog,
  };
}
