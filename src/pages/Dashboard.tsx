import { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import {
  BarChart3, Search, Trash2, Copy, Download,
  LogOut, Package, TrendingUp, ArrowLeft, Cloud, CloudOff
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/AuthContext';
import {
  ExpressRecord,
  fetchCloudRecords,
  deleteCloudRecord,
  clearCloudRecords,
} from '../lib/supabase';

interface DashboardProps {
  onBack: () => void;
}

export default function Dashboard({ onBack }: DashboardProps) {
  const { user, signOut } = useAuth();
  const [records, setRecords] = useState<ExpressRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterDate, setFilterDate] = useState('all');

  // 加载云端数据
  const loadRecords = async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchCloudRecords(user.id);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, [user]);

  // 过滤记录
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 搜索过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(r =>
        r.tracking_number.toLowerCase().includes(keyword) ||
        r.express_company.toLowerCase().includes(keyword)
      );
    }

    // 快递公司过滤
    if (filterCompany !== 'all') {
      result = result.filter(r => r.express_company === filterCompany);
    }

    // 日期过滤
    if (filterDate !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      result = result.filter(r => {
        const scanDate = new Date(r.scanned_at);
        switch (filterDate) {
          case 'today':
            return scanDate >= today;
          case 'week':
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return scanDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            return scanDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    return result;
  }, [records, searchKeyword, filterCompany, filterDate]);

  // 统计数据
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const unique = new Set(filteredRecords.map(r => r.tracking_number)).size;
    const companies: Record<string, number> = {};
    filteredRecords.forEach(r => {
      companies[r.express_company] = (companies[r.express_company] || 0) + 1;
    });
    return { total, unique, companies };
  }, [filteredRecords]);

  // 获取所有快递公司列表
  const companyList = useMemo(() => {
    const companies = new Set(records.map(r => r.express_company));
    return Array.from(companies).sort();
  }, [records]);

  // 删除单条记录
  const handleDelete = async (recordId: string) => {
    if (!confirm('确定要删除这条记录吗？')) return;

    const success = await deleteCloudRecord(recordId);
    if (success) {
      toast.success('删除成功');
      loadRecords();
    } else {
      toast.error('删除失败');
    }
  };

  // 清空所有记录
  const handleClearAll = async () => {
    if (!user) return;
    if (!confirm('确定要清空所有扫描记录吗？此操作不可恢复！')) return;

    const success = await clearCloudRecords(user.id);
    if (success) {
      toast.success('已清空所有记录');
      loadRecords();
    } else {
      toast.error('清空失败');
    }
  };

  // 复制单条记录
  const handleCopy = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast.success('已复制到剪贴板');
  };

  // 导出为Excel
  const handleExport = () => {
    if (filteredRecords.length === 0) {
      toast.warning('没有记录可导出');
      return;
    }

    const exportData = filteredRecords.map(r => ({
      '快递单号': r.tracking_number,
      '快递公司': r.express_company,
      '扫描时间': formatTime(r.scanned_at),
      '同步状态': r.synced ? '已同步' : '未同步'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '快递记录');

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 10 },
      { wch: 18 },
      { wch: 10 }
    ];

    const fileName = `集派快递记录_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`已导出 ${filteredRecords.length} 条记录`);
  };

  // 登出
  const handleLogout = async () => {
    await signOut();
    toast.success('已退出登录');
  };

  // 格式化时间
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />

      {/* 顶部导航 */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold">数据管理后台</h1>
                <p className="text-xs text-blue-200">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-24">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">总扫描数</p>
                <p className="text-xl font-bold text-gray-800">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">不重复数</p>
                <p className="text-xl font-bold text-gray-800">{stats.unique}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">快递公司</p>
                <p className="text-xl font-bold text-gray-800">{Object.keys(stats.companies).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">云端同步</p>
                <p className="text-xl font-bold text-gray-800">{records.length > 0 ? '已开启' : '未同步'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 快递公司分布 */}
        {Object.keys(stats.companies).length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              快递公司分布
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(stats.companies)
                .sort((a, b) => b[1] - a[1])
                .map(([company, count]) => (
                  <div key={company} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">{company}</span>
                    <span className="text-sm font-medium text-gray-800">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 筛选和操作栏 */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索单号或快递公司..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* 快递公司筛选 */}
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">全部公司</option>
              {companyList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* 日期筛选 */}
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="week">近7天</option>
              <option value="month">近30天</option>
            </select>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-gray-500">
              共 {filteredRecords.length} 条记录
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm"
              >
                <Download className="w-4 h-4" />
                导出Excel
              </button>
              {records.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  清空
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 记录列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 mt-2">加载中...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {searchKeyword || filterCompany !== 'all' || filterDate !== 'all'
                ? '没有找到匹配的记录'
                : '暂无扫描记录'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">快递公司</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">快递单号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">扫描时间</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {record.express_company}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-gray-800">{record.tracking_number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatTime(record.scanned_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleCopy(record.tracking_number)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                            title="复制"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => record.id && handleDelete(record.id)}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
