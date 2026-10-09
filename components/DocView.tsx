/** 약관용 아주 작은 마크다운 표시기: #/## 제목, 표(|), 번호·글머리 목록, 문단 */
export default function DocView({ body }: { body: string }) {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (l.startsWith("# ")) out.push(<h1 key={k++} className="mb-4 text-[24px] font-bold">{l.slice(2)}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={k++} className="mb-2 mt-7 text-[18px] font-bold">{l.slice(3)}</h2>);
    else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(
        <div key={k++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead><tr>{rows[0]?.map((c, j) => <th key={j} className="border border-line bg-bg px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} className="border border-line px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    } else if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ""));
      const cls = `my-2 space-y-1 pl-5 text-[15px] leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`;
      out.push(ordered ? <ol key={k++} className={cls}>{items.map((x, j) => <li key={j}>{x}</li>)}</ol> : <ul key={k++} className={cls}>{items.map((x, j) => <li key={j}>{x}</li>)}</ul>);
      continue;
    } else out.push(<p key={k++} className="my-2 text-[15px] leading-relaxed">{l}</p>);
    i++;
  }
  return <article className="text-ink">{out}</article>;
}
