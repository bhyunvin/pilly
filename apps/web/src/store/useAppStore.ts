import { create } from 'zustand';

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  userId: string | null;
  setUserId: (id: string | null) => void;
}

/**
 * @description 애플리케이션의 전역 UI 상태 및 사용자 기본 정보를 관리하는 Zustand 저장소입니다.
 * 사이드바의 개폐 상태, 현재 로그인한 사용자의 ID 등을 중앙에서 관리하여 여러 컴포넌트 간 공유합니다.
 *
 * @returns {AppState} 애플리케이션 상태와 상태 변경 함수들을 포함하는 객체
 */
export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  userId: null,
  setUserId: (id) => set({ userId: id }),
}));
