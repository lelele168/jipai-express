-- ============================================
-- 集派快递数据库设置脚本
-- 请在 Supabase SQL 编辑器中执行此脚本
-- ============================================

-- 1. 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 创建用户资料表 (profiles)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 修改快递记录表添加用户关联
-- 如果 express_records 表已存在，添加 user_id 列
-- 注意：这需要先确保 auth.users 表存在

-- 首先检查 express_records 表是否存在
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'express_records') THEN
    -- 创建新的快递记录表（带用户关联）
    CREATE TABLE express_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      tracking_number TEXT NOT NULL,
      express_company TEXT NOT NULL,
      scanned_at TIMESTAMPTZ DEFAULT NOW(),
      synced BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- 表已存在，添加 user_id 列
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'express_records' AND column_name = 'user_id') THEN
      ALTER TABLE express_records ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_express_records_user_id ON express_records(user_id);
CREATE INDEX IF NOT EXISTS idx_express_records_tracking_number ON express_records(tracking_number);
CREATE INDEX IF NOT EXISTS idx_express_records_scanned_at ON express_records(scanned_at);

-- 5. 启用 RLS (行级安全策略)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_records ENABLE ROW LEVEL SECURITY;

-- 6. profiles 表的 RLS 策略
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 7. express_records 表的 RLS 策略
-- 用户只能查看自己的记录
DROP POLICY IF EXISTS "Users can view own records" ON express_records;
CREATE POLICY "Users can view own records" ON express_records
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能插入自己的记录
DROP POLICY IF EXISTS "Users can insert own records" ON express_records;
CREATE POLICY "Users can insert own records" ON express_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能删除自己的记录
DROP POLICY IF EXISTS "Users can delete own records" ON express_records;
CREATE POLICY "Users can delete own records" ON express_records
  FOR DELETE USING (auth.uid() = user_id);

-- 用户只能更新自己的记录
DROP POLICY IF EXISTS "Users can update own records" ON express_records;
CREATE POLICY "Users can update own records" ON express_records
  FOR UPDATE USING (auth.uid() = user_id);

-- 管理员可以查看所有记录
DROP POLICY IF EXISTS "Admins can view all records" ON express_records;
CREATE POLICY "Admins can view all records" ON express_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 8. 创建自动创建用户资料的触发器函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 创建触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. 创建统计视图（可选，用于管理员面板）
CREATE OR REPLACE VIEW user_scan_stats AS
SELECT
  user_id,
  COUNT(*) as total_scans,
  COUNT(DISTINCT tracking_number) as unique_scans,
  COUNT(DISTINCT express_company) as company_count,
  MIN(scanned_at) as first_scan,
  MAX(scanned_at) as last_scan
FROM express_records
GROUP BY user_id;

-- 输出完成信息
SELECT '数据库设置完成！' as message;
