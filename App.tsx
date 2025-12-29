
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { UserRole, CarpoolSubmission, DriverData, PassengerData, Region, REWARD_OPTIONS, JOB_OPTIONS } from './types';
import RegionSelector from './components/RegionSelector';
import SubmissionCard from './components/SubmissionCard';
import { generateProfileSummary } from './services/geminiService';

// Brand Logo Component (SVG)
const ModuLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#A855F7" />
        <stop offset="100%" stopColor="#06B6D4" />
      </linearGradient>
    </defs>
    <path 
      d="M20 30C20 24.4772 24.4772 20 30 20C35.5228 20 40 24.4772 40 30V70C40 75.5228 44.4772 80 50 80C55.5228 80 60 75.5228 60 70V30C60 24.4772 64.4772 20 70 20C75.5228 20 80 24.4772 80 30V70C80 81.0457 71.0457 90 60 90C48.9543 90 40 81.0457 40 70V30C40 30 40 30 40 30C40 24.4772 35.5228 20 30 20C24.4772 20 20 24.4772 20 30V70C20 81.0457 11.0457 90 0 90V70C5.52285 70 10 65.5228 10 60V30C10 18.9543 18.9543 10 30 10C41.0457 10 50 18.9543 50 30V70C50 75.5228 54.4772 80 60 80C65.5228 80 70 75.5228 70 70V30C70 18.9543 78.9543 10 90 10C101.046 10 110 18.9543 110 30V70C110 86.5685 96.5685 100 80 100C63.4315 100 50 86.5685 50 70V30C50 24.4772 45.5228 20 40 20C34.4772 20 30 24.4772 30 30V70C30 75.5228 25.5228 80 20 80C14.4772 80 10 75.5228 10 70V30C10 24.4772 14.4772 20 20 20" 
      fill="url(#logoGradient)" 
      style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}
    />
    <path 
      d="M20 25C20 19.4772 24.4772 15 30 15C35.5228 15 40 19.4772 40 25V65C40 70.5228 44.4772 75 50 75C55.5228 75 60 70.5228 60 65V25C60 19.4772 64.4772 15 70 15C75.5228 15 80 19.4772 80 25V65C80 76.0457 71.0457 85 60 85C48.9543 85 40 76.0457 40 65V25C40 19.4772 35.5228 15 30 15C24.4772 15 20 19.4772 20 25V65C20 70.5228 15.5228 75 10 75C4.47715 75 0 70.5228 0 65V25C0 13.9543 8.9543 5 20 5C31.0457 5 40 13.9543 40 25V65C40 70.5228 44.4772 75 50 75C55.5228 75 60 70.5228 60 65V25C60 13.9543 68.9543 5 80 5C91.0457 5 100 13.9543 100 25V65C100 81.5685 86.5685 95 70 95C53.4315 95 40 81.5685 40 65V25C40 19.4772 35.5228 15 30 15C24.4772 15 20 19.4772 20 25" 
      fill="url(#logoGradient)"
    />
  </svg>
);

// Shared UI Components
const inputBaseClass = "w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white text-sm transition-all hover:border-indigo-200 shadow-sm";
const labelClass = "block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1";

// Icons
const CarIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>;
const UserIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const KakaoIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3C7.029 3 3 6.131 3 10.045c0 2.505 1.666 4.697 4.148 5.922l-.95 3.487c-.085.31.258.558.527.38l4.085-2.69c.389.043.785.066 1.19.066 4.971 0 9-3.131 9-7.045S16.971 3 12 3z"/>
  </svg>
);

// Helper to estimate taxi fare
export const calculateTaxiFare = (dep: Region | null, dest: Region | null): number => {
  if (!dep || !dest) return 0;
  let base = 4800;
  if (dep.city !== dest.city) base = 35000;
  else if (dep.district !== dest.district) base = 15000;
  else if (dep.neighborhood !== dest.neighborhood) base = 6500;
  const jitter = ((dep.neighborhood.length + dest.neighborhood.length) % 10) * 1200;
  return Math.round((base + jitter) / 100) * 100;
};

// Success Modal
const SuccessModal = ({ isOpen, onCloseHome, onCloseAgain, title, message, themeColor = "indigo" }: any) => {
  if (!isOpen) return null;
  const mainColor = themeColor === "indigo" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700";
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"></div>
      <div className="relative bg-white w-full max-w-sm rounded-[3rem] p-10 text-center shadow-2xl scale-in-center">
        <div className={`w-20 h-20 ${themeColor === 'indigo' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'} rounded-full flex items-center justify-center mx-auto mb-6`}>
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h3 className="text-2xl font-black text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-500 font-medium mb-10 leading-relaxed">{message}</p>
        <div className="space-y-3">
          <button onClick={onCloseHome} className={`w-full py-4 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95 ${mainColor}`}>홈으로 돌아가기</button>
          <button onClick={onCloseAgain} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold transition-all hover:bg-slate-200">추가 등록하기</button>
        </div>
      </div>
    </div>
  );
};

const formatPhoneNumber = (suffix: string) => suffix.length <= 4 ? `010-${suffix}` : `010-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`;

const LandingPage = () => (
  <div className="max-w-md mx-auto py-16 px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
    <div className="mb-12">
      <div className="relative inline-block mb-8">
        <div className="absolute inset-0 bg-indigo-400 blur-3xl opacity-20 scale-150 rounded-full"></div>
        <ModuLogo className="w-28 h-28 relative animate-bounce-slow" />
      </div>
      <h1 className="text-5xl font-black text-slate-900 mb-3 tracking-tighter">모두의카풀</h1>
      <p className="text-slate-500 font-bold text-lg">스마트한 출퇴근 파트너</p>
    </div>
    <div className="grid gap-5">
      <Link to="/register/driver" className="block p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:border-indigo-200 transition-all text-left group">
        <div className="flex items-center gap-6">
          <div className="p-5 bg-indigo-50 text-indigo-600 rounded-3xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><CarIcon /></div>
          <div><h3 className="font-black text-2xl text-slate-800">운전자 등록</h3><p className="text-sm text-slate-400 mt-1 font-medium">내 차로 출근하며 수익을 창출하세요.</p></div>
        </div>
      </Link>
      <Link to="/register/passenger" className="block p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:border-emerald-200 transition-all text-left group">
        <div className="flex items-center gap-6">
          <div className="p-5 bg-emerald-50 text-emerald-600 rounded-3xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner"><UserIcon /></div>
          <div><h3 className="font-black text-2xl text-slate-800">탑승자 신청</h3><p className="text-sm text-slate-400 mt-1 font-medium">편안하고 빠른 출근길을 예약하세요.</p></div>
        </div>
      </Link>
    </div>
  </div>
);

const DriverRegistration = () => {
  const navigate = useNavigate();
  const [regions, setRegions] = useState<Region[]>([]);
  const [contactSuffix, setContactSuffix] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedJob, setSelectedJob] = useState('회사원');
  const [customJob, setCustomJob] = useState('');
  const [formData, setFormData] = useState({ gender: 'MALE', carModel: '', introduction: '', schedule: '월~금 08:30' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regions.length === 0) return alert("활동 지역을 최소 1곳 선택해주세요.");
    if (contactSuffix.length < 7) return alert("연락처를 정확히 입력해주세요.");
    const contact = formatPhoneNumber(contactSuffix);
    const existing = JSON.parse(localStorage.getItem('carpool_submissions') || '[]');
    if (existing.some((s: any) => s.contact === contact && s.role === UserRole.DRIVER)) return alert("이미 신청된 연락처입니다.");

    const finalJob = selectedJob === '기타' ? customJob : selectedJob;
    const submission = { 
      ...formData, 
      job: finalJob, 
      id: crypto.randomUUID(), 
      role: UserRole.DRIVER, 
      activityRegions: regions, 
      contact: contact, 
      createdAt: Date.now() 
    } as DriverData;
    
    submission.introduction = await generateProfileSummary(submission);
    
    localStorage.setItem('carpool_submissions', JSON.stringify([...existing, submission]));
    setShowSuccess(true);
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      <SuccessModal isOpen={showSuccess} onCloseHome={() => navigate('/')} onCloseAgain={() => { setShowSuccess(false); setRegions([]); setContactSuffix(''); }} title="등록 완료!" message="AI가 당신의 프로필을 더 멋지게 요약했습니다!" />
      <Link to="/" className="inline-flex items-center text-slate-400 hover:text-indigo-600 mb-10 transition-colors font-bold text-sm">← 메인으로</Link>
      <h2 className="text-4xl font-black text-slate-900 mb-10 tracking-tight">운전자 등록</h2>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-5">
          <label className={labelClass}>활동 지역 (최대 3곳)</label>
          <RegionSelector onSelect={r => { if(regions.length < 3 && !regions.some(x=>x.neighborhood === r.neighborhood)) setRegions([...regions, r]); }} />
          <div className="flex flex-wrap gap-2">{regions.map((r, i) => (
            <span key={i} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-2xl text-xs font-bold border border-indigo-100 flex items-center">{r.city} {r.neighborhood} <button type="button" className="ml-2 text-indigo-300" onClick={() => setRegions(regions.filter((_, idx) => idx !== i))}>×</button></span>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><label className={labelClass}>성별</label><select className={inputBaseClass} value={formData.gender} onChange={e=>setFormData({...formData, gender: e.target.value as any})}><option value="MALE">남성</option><option value="FEMALE">여성</option></select></div>
          <div><label className={labelClass}>운행 시간</label><input type="text" className={inputBaseClass} placeholder="예: 평일 08:30" required value={formData.schedule} onChange={e=>setFormData({...formData, schedule: e.target.value})} /></div>
        </div>
        <div><label className={labelClass}>직업</label><select className={inputBaseClass} value={selectedJob} onChange={e=>setSelectedJob(e.target.value)}>{JOB_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
        <div><label className={labelClass}>차량 모델</label><input className={inputBaseClass} placeholder="예: 테슬라 모델Y" required value={formData.carModel} onChange={e=>setFormData({...formData, carModel: e.target.value})} /></div>
        <div><label className={labelClass}>연락처 (8자리)</label><div className="flex gap-3"><div className="bg-slate-100 text-slate-600 px-6 py-4 rounded-2xl font-bold flex items-center shadow-inner">010</div><input type="tel" className={inputBaseClass} placeholder="12345678" required value={contactSuffix} onChange={e=>setContactSuffix(e.target.value.replace(/\D/g, '').slice(0, 8))} /></div></div>
        <textarea className={`${inputBaseClass} h-32 resize-none`} placeholder="자기소개 (AI가 요약해드릴게요!)" required value={formData.introduction} onChange={e=>setFormData({...formData, introduction: e.target.value})} />
        <button type="submit" className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:bg-indigo-700 active:scale-[0.98] transition-all">운전자 등록하기</button>
      </form>
    </div>
  );
};

const PassengerRegistration = () => {
  const navigate = useNavigate();
  const [contactSuffix, setContactSuffix] = useState('');
  const [depDate, setDepDate] = useState('');
  const [depTime, setDepTime] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedJob, setSelectedJob] = useState('회사원');
  const [formData, setFormData] = useState({ gender: 'MALE', departure: null as Region | null, destination: null as Region | null, rewardType: '현금협의', keywords: [] as string[] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.departure || !formData.destination) return alert("지역을 모두 선택해주세요.");
    
    const selectedDateTime = new Date(`${depDate}T${depTime}`).getTime();
    if (selectedDateTime < Date.now() + (60 * 60 * 1000)) return alert("최소 1시간 이후의 시간만 예약 가능합니다.");

    const contact = formatPhoneNumber(contactSuffix);
    const existing = JSON.parse(localStorage.getItem('carpool_submissions') || '[]');
    
    const submission = { 
      ...formData, 
      job: selectedJob, 
      id: crypto.randomUUID(), 
      role: UserRole.PASSENGER, 
      schedule: `${depDate} ${depTime}`, 
      contact, 
      createdAt: Date.now(),
      introduction: ''
    } as PassengerData;

    submission.introduction = await generateProfileSummary(submission);
    
    localStorage.setItem('carpool_submissions', JSON.stringify([...existing, submission]));
    setShowSuccess(true);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      <SuccessModal isOpen={showSuccess} onCloseHome={() => navigate('/')} onCloseAgain={() => { setShowSuccess(false); setContactSuffix(''); }} title="신청 완료!" message="AI가 당신의 출근 루트를 멋지게 분석했습니다!" themeColor="emerald" />
      <Link to="/" className="inline-flex items-center text-slate-400 hover:text-emerald-600 mb-10 transition-colors font-bold text-sm">← 메인으로</Link>
      <h2 className="text-4xl font-black text-slate-900 mb-10 tracking-tight">탑승자 신청</h2>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
          <RegionSelector placeholderPrefix="출발 " onSelect={r=>setFormData({...formData, departure: r})} />
          <RegionSelector placeholderPrefix="도착 " onSelect={r=>setFormData({...formData, destination: r})} />
          {calculateTaxiFare(formData.departure, formData.destination) > 0 && (
            <div className="p-5 bg-yellow-50 rounded-2xl border border-yellow-100 flex justify-between items-center animate-pulse">
              <span className="text-xs font-black text-yellow-700 uppercase">택시 예상 비용</span>
              <span className="text-xl font-black text-yellow-900">약 {calculateTaxiFare(formData.departure, formData.destination).toLocaleString()}원</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><label className={labelClass}>출발 날짜</label><input type="date" min={today} className={inputBaseClass} required value={depDate} onChange={e=>setDepDate(e.target.value)} /></div>
          <div><label className={labelClass}>출발 시간 (1시간 이후 가능)</label><input type="time" className={inputBaseClass} required value={depTime} onChange={e=>setDepTime(e.target.value)} /></div>
        </div>
        <div><label className={labelClass}>연락처</label><div className="flex gap-3"><div className="bg-slate-100 text-slate-600 px-6 py-4 rounded-2xl font-bold flex items-center">010</div><input type="tel" className={inputBaseClass} placeholder="휴대폰 뒷번호" required value={contactSuffix} onChange={e=>setContactSuffix(e.target.value.replace(/\D/g, '').slice(0, 8))} /></div></div>
        <div><label className={labelClass}>보상 방식</label><select className={inputBaseClass} value={formData.rewardType} onChange={e=>setFormData({...formData, rewardType: e.target.value})}>{REWARD_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
        <button type="submit" className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:bg-emerald-700 active:scale-[0.98] transition-all">카풀 신청 완료</button>
      </form>
    </div>
  );
};

const AdminPanel = () => {
  const [submissions, setSubmissions] = useState<CarpoolSubmission[]>([]);
  const [filter, setFilter] = useState<'ALL' | UserRole>('ALL');
  const [isAuth, setIsAuth] = useState(false);
  const [pw, setPw] = useState('');

  useEffect(() => { if (isAuth) setSubmissions(JSON.parse(localStorage.getItem('carpool_submissions') || '[]').sort((a:any,b:any)=>b.createdAt - a.createdAt)); }, [isAuth]);

  const downloadCSV = () => {
    const headers = "Role,Gender,Job,Contact,Schedule,Details\n";
    const rows = submissions.map(s => {
      const details = s.role === UserRole.DRIVER ? (s as DriverData).carModel : `${(s as PassengerData).departure?.neighborhood}->${(s as PassengerData).destination?.neighborhood}`;
      return `${s.role},${s.gender},${s.job},${s.contact},${s.schedule},"${details}"`;
    }).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `carpool_data_${new Date().toISOString().slice(0,10)}.csv`);
    link.click();
  };

  if (!isAuth) return (
    <div className="max-w-md mx-auto py-40 px-6">
      <form onSubmit={e=>{e.preventDefault(); if(pw==='0928') setIsAuth(true); else alert('오류');}} className="bg-white p-12 rounded-[3rem] shadow-2xl space-y-5 text-center">
        <h2 className="text-3xl font-black">Admin Access</h2>
        <input type="password" className={inputBaseClass} placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus />
        <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold">인증하기</button>
      </form>
    </div>
  );

  const filtered = filter === 'ALL' ? submissions : submissions.filter(s => s.role === filter);

  return (
    <div className="max-w-6xl mx-auto py-16 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div><h2 className="text-4xl font-black tracking-tight">수집 데이터 현황</h2><p className="text-slate-400 font-bold mt-1">총 {submissions.length}건의 데이터가 수집되었습니다.</p></div>
        <div className="flex gap-3">
          <button onClick={downloadCSV} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all text-sm">CSV 다운로드</button>
          <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl">
            {['ALL', UserRole.DRIVER, UserRole.PASSENGER].map(f => (
              <button key={f} onClick={()=>setFilter(f as any)} className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${filter===f ? 'bg-white shadow-md text-indigo-600':'text-slate-400'}`}>{f === 'ALL' ? '전체' : (f === UserRole.DRIVER ? '운전자' : '탑승자')}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map(s => <SubmissionCard key={s.id} data={s} />)}
      </div>
    </div>
  );
};

const App = () => (
  <HashRouter>
    <style>{`
      @keyframes bounce-slow {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      .animate-bounce-slow {
        animation: bounce-slow 4s ease-in-out infinite;
      }
    `}</style>
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-100">
      <nav className="glass sticky top-0 z-[500] px-6 py-5 flex justify-between items-center border-b border-slate-200/50">
        <Link to="/" className="flex items-center gap-3 group">
          <ModuLogo className="w-8 h-8 transition-transform group-hover:scale-110" />
          <span className="font-black text-2xl text-slate-900 tracking-tighter">모두의카풀</span>
        </Link>
        <Link to="/admin" className="text-[11px] font-black text-slate-400 hover:text-indigo-600 transition-all uppercase tracking-[0.2em] px-5 py-2.5 rounded-2xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100">Admin Portal</Link>
      </nav>
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/register/driver" element={<DriverRegistration />} />
          <Route path="/register/passenger" element={<PassengerRegistration />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </main>
      <footer className="py-16 text-center border-t border-slate-200 bg-white/50">
        <div className="flex flex-col items-center gap-6">
          <a href="https://pf.kakao.com/" target="_blank" rel="noreferrer" className="flex items-center gap-3 px-10 py-5 bg-[#FEE500] text-[#3c1e1e] rounded-[2rem] font-black shadow-xl hover:scale-105 transition-transform"><KakaoIcon /> 카카오톡 실시간 상담</a>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em]">© 2024 Modu Carpool. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  </HashRouter>
);

export default App;
