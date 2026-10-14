"use client";
import { useState } from "react";
import { Sheet, api, btnPrimary, useT } from "./ui";
import type { User } from "@/lib/types";

type Choice = "carpool" | "taxi" | "other";
const OPTIONS: [Choice, string, string][] = [
  ["carpool", "출퇴근 카풀", "매일 오가는 길을 함께할 운전자·탑승자를 찾아요."],
  ["taxi", "택시 동승", "근처에서 같은 방향으로 택시를 같이 탈 사람을 찾아요."],
];

/**
 * 가입(이메일 인증) 뒤 처음 한 번 묻는 희망 선택. 출퇴근 카풀은 필수라서 항상 포함되고, 택시 동승은 함께 고를 수 있다.
 * 닫기·나중에 버튼은 없다.
 */
export default function Interests({ onSaved }: { onSaved: (user: User, picked: Choice[]) => void }) {
  const t = useT();
  const [picked, setPicked] = useState<Choice[]>(["carpool"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (c: Choice) => {
    if (c === "carpool") return; // 출퇴근 카풀은 필수
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  };

  const save = async () => {
    if (!picked.includes("carpool")) return setErr("출퇴근 카풀은 꼭 등록해야 해요.");
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "POST", { action: "interests", interests: picked });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onSaved(r.data.user, picked);
  };

  return (
    <Sheet title={t("무엇을 찾고 계세요?")} blockId="S302" onClose={() => {}} locked>
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-sub">{t("여러 개를 골라도 돼요. 나중에 내 정보에서 바꿀 수 있어요.")}</p>
        <ul className="space-y-2">
          {OPTIONS.map(([id, label, hint]) => (
            <li key={id}>
              <label data-block-id={id === "carpool" ? "F310" : id === "taxi" ? "F311" : "F312"} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${picked.includes(id) ? "border-accent bg-accentSoft" : "border-line bg-white"}`}>
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#2F6BFF]" checked={picked.includes(id)} disabled={id === "carpool"} onChange={() => toggle(id)} />
                <span>
                  <span className="block text-[16px] font-semibold">{t(label)}</span>
                  <span className="block text-[13px] leading-relaxed text-sub">{t(hint)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {err && <p role="alert" className="text-[14px] text-warn">{t(err)}</p>}
        <button data-block-id="B310" data-block-name="희망 선택 저장" className={btnPrimary} disabled={busy} onClick={save}>{busy ? t("처리 중…") : t("시작하기")}</button>
      </div>
    </Sheet>
  );
}
