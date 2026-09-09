import type { Offering } from './course.js';
export interface AdminCourse extends Offering {
  pendingReports: number;
  pendingChanges: number;
}
export interface AdminStudent {
  id: string;
  nickname: string;
  role: 'student' | 'admin';
  courseIds: string[];
  lastSyncedAt: string | null;
}
export interface AdminDashboard {
  courses: AdminCourse[];
  students: AdminStudent[];
}
export interface SyncStatus {
  lastSyncedAt: string | null;
  lastImportedAt: string | null;
}
