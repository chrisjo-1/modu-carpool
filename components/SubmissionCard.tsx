
import React from 'react';
import { CarpoolSubmission, UserRole, Region } from '../types';
import { calculateTaxiFare } from '../App';

interface SubmissionCardProps {
  data: CarpoolSubmission;
}

const SubmissionCard: React.FC<SubmissionCardProps> = ({ data }) => {
  const isDriver = data.role === UserRole.DRIVER;
  const formatRegion = (r: Region) => r ? `${r.city} ${r.neighborhood}` : '미지정';

  const copyContact = () => {
    navigator.clipboard.writeText(data.contact);
    alert('연락처가 복사되었습니다!');
  };

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-2xl transition-all duration-500 group relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-2 h-full ${isDriver ? 'bg-indigo-600' : 'bg-emerald-600'}`}></div>
      
      <div className="flex justify-between items-center mb-6">
        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isDriver ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {isDriver ? 'Driver' : 'Passenger'}
        </span>
        <span className="text-[11px] text-slate-300 font-bold">
          {new Date(data.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="space-y-5">
        {/* AI Summary Highlight */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
            "{data.introduction || '신뢰할 수 있는 카풀 파트너입니다.'}"
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="w-4 h-4 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="text-[8px] text-indigo-600 font-black">AI</span>
            </div>
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Powered by Gemini</span>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Information</span>
            <span className="text-sm font-bold text-slate-800">{data.gender === 'MALE' ? '남성' : '여성'} · {data.job}</span>
          </div>

          {isDriver ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Regions</span>
                <div className="flex flex-wrap gap-1.5">
                  {(data as any).activityRegions.map((r: any, i: number) => (
                    <span key={i} className="text-[11px] font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg">
                      {formatRegion(r)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Vehicle</span>
                <span className="text-sm font-black text-slate-900">{(data as any).carModel}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-50">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Route</span>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">{(data as any).departure?.neighborhood} →</p>
                    <p className="text-sm font-black text-slate-900">{(data as any).destination?.neighborhood}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100/50 flex justify-between items-center mt-2">
                <span className="text-[10px] font-black text-yellow-700 uppercase">Taxi Fee</span>
                <span className="text-sm font-black text-yellow-900">{calculateTaxiFare((data as any).departure, (data as any).destination).toLocaleString()}원</span>
              </div>
            </>
          )}

          <div className="pt-5 mt-2 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Schedule</span>
                <p className={`text-sm font-black ${isDriver ? 'text-indigo-600' : 'text-emerald-600'}`}>{data.schedule}</p>
              </div>
              <button 
                onClick={copyContact}
                className="flex flex-col items-end group/btn"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover/btn:text-indigo-600 transition-colors">Contact</span>
                <p className="text-sm font-mono font-black text-slate-900 group-hover/btn:underline">{data.contact}</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubmissionCard;
