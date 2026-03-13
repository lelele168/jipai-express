import { useState, useEffect, useCallback, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { Scan, History, Cloud, CloudOff, Plus, Trash2, RefreshCw, Camera, Search, BarChart3, Copy, Share2, X, QrCode, Wifi, WifiOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import Scanner from './components/Scanner';
import {
  ExpressRecord,
  identifyExpressCompany,
  validateTrackingNumber,
  saveToLocalStorage,
  getLocalRecords,
  syncToCloud,
  supabase,
} from './lib/supabase';

type TabType = 'scan' | 'history' | 'stats';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('scan');
  const [records, setRecords] = useState<ExpressRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // 加载本地记录
  const loadRecords = useCallback(() => {
    const localRecords = getLocalRecords();
    setRecords(localRecords);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // 处理扫描成功
  const handleScanSuccess = useCallback((decodedText: string) => {
    const trimmed = decodedText.trim();

    // 验证格式
    if (!validateTrackingNumber(trimmed)) {
      toast.error('无效的快递单号格式');
      return;
    }

    // 检查是否重复
    const exists = records.some(r => r.tracking_number === trimmed);
    if (exists) {
      toast.warning('该单号已存在');
      return;
    }

    // 识别快递公司
    const company = identifyExpressCompany(trimmed);

    // 创建记录
    const newRecord: ExpressRecord = {
      tracking_number: trimmed,
      express_company: company.name,
      scanned_at: new Date().toISOString(),
      synced: false
    };

    // 保存到本地
    saveToLocalStorage(newRecord);
    setRecords(prev => [newRecord, ...prev]);

    // 尝试同步到云端
    syncToCloud(newRecord).then(success => {
      if (success) {
        setRecords(prev =>
          prev.map(r =>
            r.tracking_number === trimmed ? { ...r, synced: true } : r
          )
        );
      }
    });

    toast.success(`已扫描: ${company.name} - ${trimmed}`);
  }, [records]);

  // 处理手动输入
  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      handleScanSuccess(manualInput.trim());
      setManualInput('');
      setShowManualInput(false);
    }
  };

  // 同步所有未同步记录
  const syncAll = async () => {
    setIsSyncing(true);
    const unsyncedRecords = records.filter(r => !r.synced);

    for (const record of unsyncedRecords) {
      const success = await syncToCloud(record);
      if (success) {
        setRecords(prev =>
          prev.map(r =>
            r.tracking_number === record.tracking_number ? { ...r, synced: true } : r
          )
        );
      }
    }

    setIsSyncing(false);
    toast.success('同步完成');
  };

  // 测试云端连接
  const testConnection = async () => {
    if (connectionStatus === 'testing') return;

    setConnectionStatus('testing');
    try {
      const startTime = Date.now();
      const { error } = await supabase
        .from('express_records')
        .select('id', { count: 'exact', head: true });

      const latency = Date.now() - startTime;

      if (error) throw error;

      setConnectionStatus('success');
      toast.success(`连接成功 (${latency}ms)`);
    } catch (err) {
      console.error('连接测试失败:', err);
      setConnectionStatus('error');
      toast.error('连接失败，请检查网络');
    }

    // 3秒后重置状态
    setTimeout(() => setConnectionStatus('idle'), 3000);
  };

  // 删除单条记录
  const deleteRecord = (trackingNumber: string) => {
    const updated = records.filter(r => r.tracking_number !== trackingNumber);
    localStorage.setItem('jipai_express_records', JSON.stringify(updated));
    setRecords(updated);
    toast.info('已删除记录');
  };

  // 一键清空
  const clearAll = () => {
    if (confirm('确定要清空所有记录吗？此操作不可恢复！')) {
      localStorage.removeItem('jipai_express_records');
      setRecords([]);
      toast.info('已清空所有记录');
    }
  };

  // 复制单条记录
  const copyRecord = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast.success('已复制到剪贴板');
  };

  // 导出全部记录为XLSX
  const exportAll = () => {
    if (records.length === 0) {
      toast.warning('没有记录可导出');
      return;
    }

    // 准备导出数据
    const exportData = records.map(r => ({
      '快递单号': r.tracking_number,
      '快递公司': r.express_company,
      '扫描时间': formatTime(r.scanned_at),
      '同步状态': r.synced ? '已同步' : '未同步'
    }));

    // 创建工作簿和工作表
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '快递记录');

    // 设置列宽
    worksheet['!cols'] = [
      { wch: 20 }, // 快递单号
      { wch: 10 }, // 快递公司
      { wch: 18 }, // 扫描时间
      { wch: 10 }  // 同步状态
    ];

    // 生成文件名
    const fileName = `集派快递记录_${new Date().toISOString().split('T')[0]}.xlsx`;

    // 导出文件
    XLSX.writeFile(workbook, fileName);
    toast.success(`已导出 ${records.length} 条记录`);
  };

  // 格式化时间
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 搜索过滤
  const filteredRecords = useMemo(() => {
    if (!searchKeyword) return records;
    const keyword = searchKeyword.toLowerCase();
    return records.filter(r =>
      r.tracking_number.toLowerCase().includes(keyword) ||
      r.express_company.toLowerCase().includes(keyword)
    );
  }, [records, searchKeyword]);

  // 统计数据
  const stats = useMemo(() => {
    const total = records.length;
    const unique = new Set(records.map(r => r.tracking_number)).size;
    const companies: Record<string, number> = {};
    records.forEach(r => {
      companies[r.express_company] = (companies[r.express_company] || 0) + 1;
    });
    return { total, unique, companies };
  }, [records]);

  const syncedCount = records.filter(r => r.synced).length;
  const totalCount = records.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />

      {/* 顶部标题 */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <QrCode className="w-6 h-6" />
            集派快递
          </h1>
          <button
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
              connectionStatus === 'success' ? 'bg-green-500 text-white' :
              connectionStatus === 'error' ? 'bg-red-500 text-white' :
              connectionStatus === 'testing' ? 'bg-yellow-500 text-white animate-pulse' :
              'hover:bg-blue-700'
            }`}
          >
            {connectionStatus === 'success' ? (
              <>
                <Wifi className="w-4 h-4" />
                已连接
              </>
            ) : connectionStatus === 'error' ? (
              <>
                <WifiOff className="w-4 h-4" />
                连接失败
              </>
            ) : connectionStatus === 'testing' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                测试中
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4" />
                {syncedCount === totalCount && totalCount > 0 ? '已同步' : `${syncedCount}/${totalCount}`}
              </>
            )}
          </button>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-md mx-auto p-4 pb-24">

        {/* 扫描页面 */}
        {activeTab === 'scan' && (
          <div className="space-y-6">
            {!showScanner ? (
              <div className="text-center py-8">
                <div className="w-32 h-32 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <Scan className="w-16 h-16 text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">
                  扫描快递单号
                </h2>
                <p className="text-gray-500 mb-6">
                  将快递单上的条形码或二维码对准扫描框
                </p>

                <div className="flex flex-col gap-3 px-4">
                  <button
                    onClick={() => setShowScanner(true)}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    立即扫描
                  </button>

                  <button
                    onClick={() => setShowManualInput(true)}
                    className="w-full py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    手动输入
                  </button>
                </div>

                {/* 手动输入弹窗 */}
                {showManualInput && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">手动输入单号</h3>
                        <button onClick={() => setShowManualInput(false)}>
                          <X className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="请输入快递单号"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        autoFocus
                      />
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => {
                            setShowManualInput(false);
                            setManualInput('');
                          }}
                          className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleManualSubmit}
                          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                        >
                          确认
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Scanner
                  onScanSuccess={handleScanSuccess}
                  onError={(error) => toast.error(error)}
                />
                <button
                  onClick={() => setShowScanner(false)}
                  className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl"
                >
                  返回
                </button>
              </div>
            )}
          </div>
        )}

        {/* 历史记录页面 */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* 搜索栏 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索单号或快递公司..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                共 {filteredRecords.length} 条记录
              </span>
              <div className="flex gap-2">
                {records.length > 0 && (
                  <>
                    <button
                      onClick={exportAll}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm"
                    >
                      <Share2 className="w-4 h-4" />
                      导出
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      清空
                    </button>
                  </>
                )}
                {syncedCount < totalCount && (
                  <button
                    onClick={syncAll}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    同步
                  </button>
                )}
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchKeyword ? '没有找到匹配的记录' : '暂无扫描记录'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRecords.map((record, index) => (
                  <div
                    key={`${record.tracking_number}-${index}`}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {record.express_company}
                          </span>
                          {record.synced ? (
                            <Cloud className="w-4 h-4 text-green-500" />
                          ) : (
                            <CloudOff className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <p className="font-mono text-lg text-gray-800 font-medium">
                          {record.tracking_number}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatTime(record.scanned_at)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => copyRecord(record.tracking_number)}
                          className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                          title="复制"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteRecord(record.tracking_number)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 统计页面 */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">
              数据统计
            </h2>

            {/* 统计卡片 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                <p className="text-sm opacity-80">总扫描数</p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                <p className="text-sm opacity-80">不重复数</p>
                <p className="text-3xl font-bold mt-1">{stats.unique}</p>
              </div>
            </div>

            {/* 快递公司分布 */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                快递公司分布
              </h3>
              {Object.keys(stats.companies).length === 0 ? (
                <p className="text-gray-400 text-center py-8">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.companies)
                    .sort((a, b) => b[1] - a[1])
                    .map(([company, count]) => (
                      <div key={company}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{company}</span>
                          <span className="text-gray-800 font-medium">{count} 单</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(count / stats.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 清空数据按钮 */}
            {records.length > 0 && (
              <button
                onClick={clearAll}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium"
              >
                清空所有数据
              </button>
            )}
          </div>
        )}
      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
        <div className="max-w-md mx-auto flex">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${
              activeTab === 'scan'
                ? 'text-blue-600'
                : 'text-gray-500'
            }`}
          >
            <Scan className="w-6 h-6" />
            <span className="text-xs font-medium">扫描</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${
              activeTab === 'history'
                ? 'text-blue-600'
                : 'text-gray-500'
            }`}
          >
            <History className="w-6 h-6" />
            <span className="text-xs font-medium">历史</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${
              activeTab === 'stats'
                ? 'text-blue-600'
                : 'text-gray-500'
            }`}
          >
            <BarChart3 className="w-6 h-6" />
            <span className="text-xs font-medium">统计</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
