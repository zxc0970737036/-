
import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, Upload, Trash2, Play, Square, Plus, 
  Check, Loader2, Archive, AlertCircle, 
  ExternalLink, Palette, Settings2, Scissors, 
  Sparkles, ChevronLeft, Image as ImageIcon,
  MousePointer2, SlidersHorizontal
} from 'lucide-react';
import { GeminiService } from './geminiService';
import { DEFAULT_EXPRESSIONS } from './constants';
import { Expression, GenerationStatus } from './types';

// 宣告 JSZip
declare const JSZip: any;

type ViewMode = 'generator' | 'remover';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('generator');
  
  // Generator States
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('character');
  const [expressions, setExpressions] = useState<Expression[]>(DEFAULT_EXPRESSIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<string>('');
  const [bgColor, setBgColor] = useState('#00FF00');
  const [downloadSize, setDownloadSize] = useState<'320' | 'raw'>('320');
  
  // Remover States
  const [removerFiles, setRemoverFiles] = useState<any[]>([]);
  const [removerTolerance, setRemoverTolerance] = useState(45);
  const [isRemoverProcessing, setIsRemoverProcessing] = useState(false);

  const stopRequested = useRef(false);
  const geminiService = useRef(new GeminiService());

  // --- Generator Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSourceImage(event.target?.result as string);
      setSourceFileName(file.name.split('.')[0]);
      setGlobalStatus('');
    };
    reader.readAsDataURL(file);
  };

  const startGeneration = async () => {
    if (!sourceImage) return;
    const selected = expressions.filter(e => e.isSelected && e.status !== GenerationStatus.SUCCESS);
    if (selected.length === 0) return;

    setIsGenerating(true);
    setGlobalStatus('生成中...');
    stopRequested.current = false;

    for (let i = 0; i < expressions.length; i++) {
      if (stopRequested.current) break;
      if (!expressions[i].isSelected || expressions[i].status === GenerationStatus.SUCCESS) continue;

      setExpressions(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: GenerationStatus.PENDING, error: undefined };
        return next;
      });

      try {
        const resultUrl = await geminiService.current.generateExpressionImage(sourceImage, expressions[i].enLabel, bgColor);
        setExpressions(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: GenerationStatus.SUCCESS, resultUrl };
          return next;
        });
      } catch (error: any) {
        setExpressions(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: GenerationStatus.ERROR, error: error.message };
          return next;
        });
      }
    }
    setIsGenerating(false);
    setGlobalStatus(stopRequested.current ? '已停止' : '完成');
  };

  // --- Remover Logic (整合原本 remover.html 的核心演算法) ---
  const handleRemoverUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        setRemoverFiles(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          file,
          name: file.name,
          src: e.target?.result as string,
          status: 'ready',
          customColor: null,
          resultUrl: null
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const floodFill = (cand: Uint8Array, w: number, h: number) => {
    const mask = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let ptr = 0;
    const push = (x: number, y: number) => {
      const idx = y * w + x;
      if (idx >= 0 && idx < mask.length && !mask[idx] && cand[idx]) {
        mask[idx] = 1;
        stack[ptr++] = idx;
      }
    };
    for(let x=0; x<w; x++) { push(x, 0); push(x, h-1); }
    for(let y=0; y<h; y++) { push(0, y); push(w-1, y); }
    while (ptr > 0) {
      const idx = stack[--ptr];
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    return mask;
  };

  const processRemover = async () => {
    setIsRemoverProcessing(true);
    const tolSq = removerTolerance * removerTolerance;
    
    const newFiles = [...removerFiles];
    for (let i = 0; i < newFiles.length; i++) {
      if (newFiles[i].status !== 'ready') continue;
      
      const item = newFiles[i];
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          canvas.width = img.width; canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const w = canvas.width; const h = canvas.height;
          
          let refR = item.customColor ? item.customColor[0] : data[0];
          let refG = item.customColor ? item.customColor[1] : data[1];
          let refB = item.customColor ? item.customColor[2] : data[2];

          const cand = new Uint8Array(w * h);
          for (let j = 0; j < data.length; j += 4) {
            const dSq = Math.pow(data[j]-refR, 2) + Math.pow(data[j+1]-refG, 2) + Math.pow(data[j+2]-refB, 2);
            if (dSq < tolSq) cand[j/4] = 1;
          }
          const mask = floodFill(cand, w, h);
          for (let j = 0; j < data.length; j += 4) if (mask[j/4]) data[j+3] = 0;
          ctx.putImageData(imageData, 0, 0);
          newFiles[i].resultUrl = canvas.toDataURL('image/png');
          newFiles[i].status = 'done';
          resolve(null);
        };
        img.src = item.src;
      });
      setRemoverFiles([...newFiles]);
    }
    setIsRemoverProcessing(false);
  };

  const pickRemoverColor = (e: React.MouseEvent, id: string) => {
    const img = e.currentTarget as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const rect = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    setRemoverFiles(prev => prev.map(f => f.id === id ? { ...f, customColor: [pixel[0], pixel[1], pixel[2]] } : f));
  };

  // --- Render Views ---
  const renderGenerator = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in fade-in duration-500">
      <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-8">
        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
          <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-gray-800">
            <Upload className="w-5 h-5 text-indigo-600" />
            1. 上傳角色圖片
          </h2>
          {!sourceImage ? (
            <label className="flex flex-col items-center justify-center w-full h-64 border-4 border-dashed border-gray-100 rounded-[2rem] cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-all group">
              <Upload className="w-12 h-12 text-gray-200 mb-4 group-hover:text-indigo-400" />
              <p className="text-sm text-gray-600 font-black">點擊上傳角色</p>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="aspect-square rounded-[2rem] overflow-hidden bg-gray-50 border border-gray-100 p-2">
                <img src={sourceImage} className="w-full h-full object-contain rounded-xl" alt="source" />
              </div>
              <button onClick={() => setSourceImage(null)} className="w-full py-3 text-sm font-black text-red-500 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> 更換圖片
              </button>
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
          <h2 className="text-xl font-black mb-4 text-gray-800">2. 選擇表情</h2>
          <div className="flex gap-2 mb-4">
            <input 
              type="text" value={customInput} 
              onChange={e => setCustomInput(e.target.value)}
              placeholder="新增自訂表情"
              className="flex-1 px-4 py-3 bg-gray-50 rounded-2xl text-sm font-bold border-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              onClick={async () => {
                setIsTranslating(true);
                const en = await geminiService.current.translateToEnglish(customInput);
                setExpressions(prev => [...prev, { id: Date.now().toString(), label: customInput, enLabel: en, isSelected: true, status: GenerationStatus.IDLE }]);
                setCustomInput('');
                setIsTranslating(false);
              }}
              className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100"
            >
              {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {expressions.map((exp, idx) => (
              <button 
                key={exp.id} 
                onClick={() => setExpressions(prev => prev.map((e, i) => i === idx ? { ...e, isSelected: !e.isSelected } : e))}
                className={`p-3 rounded-xl border-2 text-xs font-black transition-all ${exp.isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-50 bg-gray-50 text-gray-400'}`}
              >
                {exp.label}
              </button>
            ))}
          </div>
        </section>

        <button 
          onClick={isGenerating ? () => stopRequested.current = true : startGeneration}
          disabled={!sourceImage || isTranslating}
          className={`w-full py-5 rounded-[2rem] font-black shadow-2xl flex items-center justify-center gap-3 transition-all ${isGenerating ? 'bg-gray-900 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'}`}
        >
          {isGenerating ? <><Square className="w-5 h-5 fill-current" /> 停止</> : <><Play className="w-5 h-5 fill-current" /> 開始批量生成</>}
        </button>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <section className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-sm border border-gray-100 min-h-[600px]">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-3xl font-black text-gray-900">表情畫廊</h2>
              {globalStatus && <p className="text-indigo-600 font-bold mt-1 text-sm">{globalStatus}</p>}
            </div>
            {hasSuccessful && (
              <button 
                onClick={async () => {
                  const zip = new JSZip();
                  const successExps = expressions.filter(e => e.status === GenerationStatus.SUCCESS);
                  for (let e of successExps) {
                    const blob = await (await fetch(e.resultUrl!)).blob();
                    zip.file(`${sourceFileName}_${e.label}.png`, blob);
                  }
                  const content = await zip.generateAsync({ type: "blob" });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(content);
                  link.download = `${sourceFileName}_表情包.zip`;
                  link.click();
                }}
                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-indigo-100"
              >
                <Archive className="w-5 h-5" /> 全部打包
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {expressions.filter(e => e.isSelected).map((exp) => (
              <div key={exp.id} className="flex flex-col group">
                <div 
                  className={`aspect-square rounded-[2.5rem] border-4 flex items-center justify-center relative transition-all overflow-hidden ${exp.status === GenerationStatus.PENDING ? 'border-indigo-400 animate-pulse' : 'border-white shadow-lg bg-gray-50'}`}
                  style={{ backgroundColor: exp.status === GenerationStatus.SUCCESS ? bgColor : undefined }}
                >
                  {exp.status === GenerationStatus.PENDING && <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />}
                  {exp.status === GenerationStatus.SUCCESS && exp.resultUrl && (
                    <>
                      <img src={exp.resultUrl} className="w-full h-full object-cover" alt={exp.label} />
                      <button 
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = exp.resultUrl!; a.download = `${exp.label}.png`; a.click();
                        }}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <Download className="w-8 h-8 text-white" />
                      </button>
                    </>
                  )}
                  {exp.status === GenerationStatus.ERROR && <AlertCircle className="w-8 h-8 text-red-400" />}
                </div>
                <span className="mt-3 text-center font-black text-gray-700">{exp.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderRemover = () => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start animate-in slide-in-from-bottom-4 duration-500">
      <div className="lg:col-span-1 space-y-6">
        <section className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-600" /> 去背設定
          </h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">去背容差</label>
                <span className="text-xs font-mono font-black text-indigo-600">{removerTolerance}</span>
              </div>
              <input 
                type="range" min="5" max="150" value={removerTolerance} 
                onChange={e => setRemoverTolerance(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-[10px] font-bold text-indigo-600 leading-relaxed">
              💡 提示：點擊下方預覽圖可「手動取色」。<br/>若角色邊緣模糊，請調高容差。
            </div>
            <button 
              onClick={processRemover}
              disabled={isRemoverProcessing || removerFiles.filter(f => f.status === 'ready').length === 0}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-30"
            >
              {isRemoverProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '🪄 開始去背'}
            </button>
            <button 
              onClick={() => setRemoverFiles([])}
              className="w-full py-3 bg-gray-50 text-gray-400 rounded-2xl font-bold text-xs hover:bg-gray-100"
            >
              重置所有圖片
            </button>
          </div>
        </section>
        
        <label className="bg-white p-8 rounded-[2rem] border-4 border-dashed border-gray-100 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-300 transition-all group">
          <ImageIcon className="w-10 h-10 text-gray-200 mb-2 group-hover:text-indigo-400 transition-colors" />
          <p className="text-sm font-black text-gray-600">批量上傳貼圖</p>
          <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleRemoverUpload(e.target.files)} />
        </label>
      </div>

      <div className="lg:col-span-3">
        <section className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-sm border border-gray-100 min-h-[600px]">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-3xl font-black text-gray-900">去背預覽</h2>
            <div className="flex gap-4">
              {removerFiles.some(f => f.status === 'done') && (
                 <button 
                  onClick={async () => {
                    for (let f of removerFiles.filter(i => i.status === 'done')) {
                      const a = document.createElement('a');
                      a.href = f.resultUrl; a.download = `${f.name}_noBG.png`; a.click();
                      await new Promise(r => setTimeout(r, 400));
                    }
                  }}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm flex items-center gap-2"
                 >
                   <Download className="w-4 h-4" /> 下載所有 PNG
                 </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
            {removerFiles.map(file => (
              <div key={file.id} className="flex flex-col group">
                <div className="aspect-square rounded-[2rem] border-4 border-white shadow-lg overflow-hidden relative cursor-crosshair bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] bg-white">
                  <img 
                    src={file.status === 'done' ? file.resultUrl : file.src} 
                    className="w-full h-full object-contain" 
                    onClick={e => pickRemoverColor(e, file.id)}
                    alt="preview"
                  />
                  <div className="absolute top-4 right-4">
                    <span className={`text-[9px] font-black px-3 py-1.5 rounded-full shadow-lg text-white ${file.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
                      {file.status === 'done' ? '✓ 完成' : file.customColor ? '已鎖定顏色' : '待處理'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 px-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-400 truncate max-w-[120px]">{file.name}</span>
                  {file.status === 'done' && (
                    <button 
                      onClick={() => { const a = document.createElement('a'); a.href = file.resultUrl; a.download = 'noBG.png'; a.click(); }}
                      className="text-indigo-600 font-black text-[10px] hover:underline"
                    >
                      DOWNLOAD
                    </button>
                  )}
                </div>
              </div>
            ))}
            {removerFiles.length === 0 && (
              <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-200">
                <MousePointer2 className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-black text-lg">尚未上傳圖片進行去背</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );

  const hasSuccessful = expressions.some(e => e.status === GenerationStatus.SUCCESS);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
      {/* 導航欄 */}
      <nav className="flex items-center justify-between mb-12 bg-white p-2 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-4 ml-6">
          <h1 className="text-lg font-black text-gray-800 tracking-tighter">表情貼圖生成器</h1>
        </div>
        <div className="flex gap-2 mr-2">
          <button 
            onClick={() => setView('generator')}
            className={`px-6 py-3 rounded-[2rem] font-black text-sm flex items-center gap-2 transition-all ${view === 'generator' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <Sparkles className="w-4 h-4" /> 貼圖生成
          </button>
          <button 
            onClick={() => setView('remover')}
            className={`px-6 py-3 rounded-[2rem] font-black text-sm flex items-center gap-2 transition-all ${view === 'remover' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <Scissors className="w-4 h-4" /> 一鍵去背
          </button>
        </div>
      </nav>

      {/* 視圖內容 */}
      <main className="flex-1">
        {view === 'generator' ? renderGenerator() : renderRemover()}
      </main>

      <footer className="mt-20 py-10 text-center border-t border-gray-100">
        <div className="flex items-center justify-center gap-4 mb-4">
           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Powered by Gemini 2.5 Flash</span>
           <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">© 2025 AI Sticker Studio</span>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-in { animation: fadeIn 0.5s ease-out; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px; width: 18px;
          border-radius: 50%; background: #4f46e5;
          cursor: pointer; box-shadow: 0 0 10px rgba(79, 70, 229, 0.4);
        }
      `}</style>
    </div>
  );
};

export default App;
