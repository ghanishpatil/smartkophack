import { create } from 'zustand'

/** Lightweight admin UI state (filters persist during session). */
export const useAdminFiltersStore = create((set) => ({
  teamsGlobalFilter: '',
  setTeamsGlobalFilter: (teamsGlobalFilter) => set({ teamsGlobalFilter }),
  registrationsGlobalFilter: '',
  setRegistrationsGlobalFilter: (registrationsGlobalFilter) => set({ registrationsGlobalFilter }),
  paymentsGlobalFilter: '',
  setPaymentsGlobalFilter: (paymentsGlobalFilter) => set({ paymentsGlobalFilter }),
  submissionsGlobalFilter: '',
  setSubmissionsGlobalFilter: (submissionsGlobalFilter) => set({ submissionsGlobalFilter }),
  evaluationsGlobalFilter: '',
  setEvaluationsGlobalFilter: (evaluationsGlobalFilter) => set({ evaluationsGlobalFilter }),
  accessGlobalFilter: '',
  setAccessGlobalFilter: (accessGlobalFilter) => set({ accessGlobalFilter }),
  usersGlobalFilter: '',
  setUsersGlobalFilter: (usersGlobalFilter) => set({ usersGlobalFilter }),
}))
