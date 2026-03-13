import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, Flashlight, Volume2 } from 'lucide-react';

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onError?: (error: string) => void;
}

// 播放提示音
const playBeep = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch (e) {
    console.log('播放提示音失败', e);
  }
};

export default function Scanner({ onScanSuccess, onError }: ScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner';
  const lastScanRef = useRef<string>('');
  const scanTimeRef = useRef<number>(0);

  const startScanner = useCallback(async () => {
    try {
      // 先检查摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(track => track.stop());

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      // 使用更简化的配置提高兼容性
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 180 },
        },
        (decodedText) => {
          // 防重复扫描：1秒内同一单号不重复识别
          const now = Date.now();
          if (decodedText === lastScanRef.current && (now - scanTimeRef.current) < 1000) {
            return;
          }
          lastScanRef.current = decodedText;
          scanTimeRef.current = now;

          // 播放提示音
          if (soundOn) {
            playBeep();
          }

          onScanSuccess(decodedText);
        },
        (errorMessage) => {
          // 忽略无扫描结果的错误
        }
      );

      setIsScanning(true);
      setHasPermission(true);
    } catch (err: any) {
      console.error('启动扫描器失败:', err);
      setHasPermission(false);

      let errorMsg = '无法访问摄像头';
      if (err.message && err.message.includes('Permission denied')) {
        errorMsg = '摄像头权限被拒绝，请允许摄像头访问';
      } else if (err.message && err.message.includes('NotFoundError')) {
        errorMsg = '未找到摄像头设备';
      } else if (err.message && err.message.includes('NotAllowedError')) {
        errorMsg = '摄像头权限被拒绝，请允许访问';
      }

      if (onError) {
        onError(errorMsg);
      }
    }
  }, [onScanSuccess, onError, soundOn]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error('停止扫描器失败:', err);
      }
    }
    setIsScanning(false);
    lastScanRef.current = '';
  }, []);

  // 闪光灯功能 - 简化版
  const toggleFlash = useCallback(() => {
    setFlashOn(!flashOn);
    if (!flashOn) {
      alert('请手动开启手机手电筒辅助照明');
    }
  }, [flashOn]);

  // 声音开关
  const toggleSound = useCallback(() => {
    setSoundOn(!soundOn);
  }, [soundOn]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto">
      <div className="relative w-full overflow-hidden rounded-xl bg-black aspect-[16/9]">
        <div id={scannerContainerId} className="w-full h-full" />

        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
            <CameraOff className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-400 text-center px-4">
              {hasPermission === false
                ? '无法访问摄像头，请检查权限设置\n\n请确保：\n1. 已授予摄像头权限\n2. 使用HTTPS或localhost访问\n3. 未被其他应用占用'
                : '点击下方按钮开始扫描'}
            </p>
          </div>
        )}

        {/* 扫描框装饰 */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            {/* 扫描区域 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-48 border-2 border-blue-500 rounded-lg">
              {/* 四个角落 */}
              <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
              <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
              <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
              <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

              {/* 扫描线动画 */}
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-400 animate-scan-line" />
            </div>

            {/* 提示文字 */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-white text-sm bg-black/50 py-1 mx-8 rounded">
                将快递单条码对准扫描框
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 控制按钮 */}
      <div className="flex gap-3 mt-6">
        {!isScanning ? (
          <button
            onClick={startScanner}
            className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg transition-colors"
          >
            <Camera className="w-6 h-6" />
            开始扫描
          </button>
        ) : (
          <>
            <button
              onClick={stopScanner}
              className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
            >
              <CameraOff className="w-5 h-5" />
              停止
            </button>
            <button
              onClick={toggleFlash}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors ${
                flashOn
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              <Flashlight className="w-5 h-5" />
            </button>
            <button
              onClick={toggleSound}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors ${
                soundOn
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-400 hover:bg-gray-500 text-white'
              }`}
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      <p className="mt-4 text-sm text-gray-500 text-center px-4">
        支持条码：快递单条形码、二维码、Code128、EAN-13等
      </p>

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(-80px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(80px); opacity: 0; }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
