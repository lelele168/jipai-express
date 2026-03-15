import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kebadgbkgmjsucjolktq.supabase.co';
const supabaseAnonKey = 'sb_publishable_4W7AsPmD1dkVsKu15PiG2A__Gn4BZSy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 用户类型
export interface User {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

// 快递单号类型
export interface ExpressRecord {
  id?: string;
  user_id?: string;
  tracking_number: string;
  express_company: string;
  scanned_at: string;
  synced: boolean;
  notes?: string;
}

// 快递公司类型
export interface ExpressCompany {
  code: string;
  name: string;
  regex: string;
}

// 主流快递公司配置
export const EXPRESS_COMPANIES: ExpressCompany[] = [
  { code: 'SF', name: '顺丰', regex: '^(SF|sf)[0-9]{12}$' },
  { code: 'YTO', name: '圆通', regex: '^(YT|yt)[0-9]{13}$' },
  { code: 'ZTO', name: '中通', regex: '^(ZT|zt|汇|)[0-9]{12,14}$' },
  { code: 'STO', name: '申通', regex: '^(ST|sto)[0-9]{12}$' },
  { code: 'EMS', name: 'EMS', regex: '^(EMS|Ems)[0-9]{13}$|^(95|96)[0-9]{11}$' },
  { code: 'JD', name: '京东', regex: '^(JD|jd)[0-9]{13}$' },
  { code: 'Yunda', name: '韵达', regex: '^(YD|yd)[0-9]{13}$' },
  { code: 'Best', name: '百世', regex: '^(HT|ht|BEST)[0-9]{12,13}$' },
  { code: 'ZJS', name: '宅急送', regex: '^(ZJS|zjs)[0-9]{12}$' },
  { code: 'DB', name: '德邦', regex: '^(DP|dp)[0-9]{12,15}$' },
  { code: 'UPS', name: 'UPS', regex: '^[0-9]{9}Z$|^1Z[A-Z0-9]{16}$' },
  { code: 'DHL', name: 'DHL', regex: '^[0-9]{10,11}$|^[0-9]{5}[A-Z]{1}[0-9]{5}$' },
  { code: 'FedEx', name: 'FedEx', regex: '^[0-9]{12,15}$|^[0-9]{9}[A-Z]{2}$' },
  { code: 'J&T', name: '极兔', regex: '^(JT|jt)[0-9]{12}$' },
  { code: 'Unknown', name: '未知', regex: '^[0-9]{8,20}$' },
];

// 识别快递公司
export function identifyExpressCompany(trackingNumber: string): ExpressCompany {
  const cleanNumber = trackingNumber.trim().toUpperCase();

  for (const company of EXPRESS_COMPANIES) {
    if (company.code === 'Unknown') continue;
    const regex = new RegExp(company.regex, 'i');
    if (regex.test(cleanNumber)) {
      return company;
    }
  }

  // 如果无法识别，返回未知但仍返回
  return EXPRESS_COMPANIES.find(c => c.code === 'Unknown')!;
}

// 验证快递单号格式
export function validateTrackingNumber(trackingNumber: string): boolean {
  const cleanNumber = trackingNumber.trim();
  // 基本验证：8-20位数字或字母组合
  return /^[A-Za-z0-9]{8,20}$/.test(cleanNumber);
}

// 保存记录到本地存储
export function saveToLocalStorage(record: ExpressRecord): void {
  const existing = getLocalRecords();
  existing.unshift(record);
  localStorage.setItem('jipai_express_records', JSON.stringify(existing));
}

// 获取本地记录
export function getLocalRecords(): ExpressRecord[] {
  const data = localStorage.getItem('jipai_express_records');
  return data ? JSON.parse(data) : [];
}

// 清除本地记录
export function clearLocalRecords(): void {
  localStorage.removeItem('jipai_express_records');
}

// 同步到云端（带用户ID）
export async function syncToCloud(record: ExpressRecord, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('express_records')
      .insert([{
        user_id: userId,
        tracking_number: record.tracking_number,
        express_company: record.express_company,
        scanned_at: record.scanned_at,
        synced: true,
        notes: record.notes || ''
      }]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('同步失败:', error);
    return false;
  }
}

// 从云端获取当前用户的记录
export async function fetchCloudRecords(userId: string): Promise<ExpressRecord[]> {
  try {
    const { data, error } = await supabase
      .from('express_records')
      .select('*')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('获取云端记录失败:', error);
    return [];
  }
}

// 删除云端记录
export async function deleteCloudRecord(recordId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('express_records')
      .delete()
      .eq('id', recordId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('删除记录失败:', error);
    return false;
  }
}

// 清空用户所有云端记录
export async function clearCloudRecords(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('express_records')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('清空记录失败:', error);
    return false;
  }
}

// 获取所有用户的统计数据（管理员用）
export async function fetchAllStats(): Promise<{ total: number; users: number; companies: Record<string, number> }> {
  try {
    const { data, error } = await supabase
      .from('express_records')
      .select('user_id, express_company');

    if (error) throw error;

    const total = data?.length || 0;
    const uniqueUsers = new Set(data?.map(r => r.user_id)).size;
    const companies: Record<string, number> = {};

    data?.forEach(r => {
      companies[r.express_company] = (companies[r.express_company] || 0) + 1;
    });

    return { total, users: uniqueUsers, companies };
  } catch (error) {
    console.error('获取统计失败:', error);
    return { total: 0, users: 0, companies: {} };
  }
}
