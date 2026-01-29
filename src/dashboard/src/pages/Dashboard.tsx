import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useStationStore } from '@/stores/stationStore';
import { useAuthStore } from '@/stores/authStore';
import { StationCard } from '@/components/station/StationCard';
import { Pagination } from '@/components/common/Pagination';

interface DashboardStats {
  totalStations: number;
  activeStations: number;
  totalConnectors: number;
  availableConnectors: number;
}

/**
 * Dashboard 메인 페이지
 *
 * 수정됨: useEffect 무한 리렌더링 버그 해결
 * - useCallback으로 함수 메모이제이션
 * - useMemo로 계산된 값 캐싱
 * - 의존성 배열에서 순환 참조 제거
 */
export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { stations, fetchStations, isLoading } = useStationStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');

  // FIX: useMemo로 stats 계산 (stations가 변경될 때만 재계산)
  const stats = useMemo<DashboardStats>(() => ({
    totalStations: stations.length,
    activeStations: stations.filter(s => s.status === 'active').length,
    totalConnectors: stations.reduce((sum, s) => sum + (s.connectors?.length || 0), 0),
    availableConnectors: stations.reduce((sum, s) =>
      sum + (s.connectors?.filter(c => c.status === 'available').length || 0), 0
    ),
  }), [stations]);

  // FIX: 데이터 fetch는 페이지 변경 시에만 실행
  useEffect(() => {
    console.log('Fetching dashboard data...');

    fetchStations({
      page: currentPage,
      filters: { status: filterStatus, search: filterSearch }
    });
  }, [fetchStations, currentPage, filterStatus, filterSearch]); // stats 제거, 원시값만 의존성으로

  // FIX: useCallback으로 함수 메모이제이션
  const handleFilterChange = useCallback((newFilter: { status?: string; search?: string }) => {
    if (newFilter.status !== undefined) setFilterStatus(newFilter.status);
    if (newFilter.search !== undefined) setFilterSearch(newFilter.search);
  }, []);

  // FIX: useMemo로 필터링된 배열 캐싱
  const filteredStations = useMemo(() => stations.filter(station => {
    if (filterStatus !== 'all' && station.status !== filterStatus) {
      return false;
    }
    if (filterSearch && !station.name.toLowerCase().includes(filterSearch.toLowerCase())) {
      return false;
    }
    return true;
  }), [stations, filterStatus, filterSearch]);

  const pageSize = 10;
  const totalPages = Math.ceil(filteredStations.length / pageSize);
  const paginatedStations = filteredStations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Welcome back, {user?.name || 'User'}
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Stations"
          value={stats.totalStations}
          icon="building"
        />
        <StatCard
          title="Active Stations"
          value={stats.activeStations}
          icon="check-circle"
          variant="success"
        />
        <StatCard
          title="Total Connectors"
          value={stats.totalConnectors}
          icon="plug"
        />
        <StatCard
          title="Available"
          value={stats.availableConnectors}
          icon="bolt"
          variant="info"
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <select
            value={filterStatus}
            onChange={(e) => handleFilterChange({ status: e.target.value })}
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>

          <input
            type="text"
            value={filterSearch}
            onChange={(e) => handleFilterChange({ search: e.target.value })}
            placeholder="Search stations..."
            className="px-4 py-2 border rounded-lg flex-1 min-w-[200px] dark:bg-gray-700 dark:border-gray-600"
            aria-label="Search stations"
          />
        </div>
      </div>

      {/* Station List */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {paginatedStations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onClick={() => console.log('Navigate to station', station.id)}
              />
            ))}
          </div>

          {filteredStations.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No stations found matching your criteria.
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// StatCard 컴포넌트
interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  variant?: 'default' | 'success' | 'warning' | 'info';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  variant = 'default'
}) => {
  const variantStyles = {
    default: 'bg-white dark:bg-gray-800',
    success: 'bg-green-50 dark:bg-green-900/20',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20',
    info: 'bg-blue-50 dark:bg-blue-900/20',
  };

  return (
    <div className={`${variantStyles[variant]} rounded-lg shadow p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {value.toLocaleString()}
          </p>
        </div>
        <div className="text-3xl text-gray-400 dark:text-gray-500">
          {/* Icon placeholder */}
          <span aria-hidden="true">{getIconEmoji(icon)}</span>
        </div>
      </div>
    </div>
  );
};

function getIconEmoji(icon: string): string {
  const icons: Record<string, string> = {
    'building': '🏢',
    'check-circle': '✅',
    'plug': '🔌',
    'bolt': '⚡',
  };
  return icons[icon] || '📊';
}

export default Dashboard;
