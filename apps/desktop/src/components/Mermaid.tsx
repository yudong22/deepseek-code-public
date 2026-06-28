import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
});

/** 简单字符串 hash（djb2）—— 稳定且无需引入外部库 */
function hashString(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export default function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  // 用 chart 内容 hash 生成稳定 id：相同内容 → 相同 id（mermaid 内部缓存命中）
  // 不同内容 → 不同 id（mermaid 不会因 id 冲突而抛错）
  const id = useRef(`mermaid-${hashString(chart)}`);

  useEffect(() => {
    let active = true;
    async function renderChart() {
      try {
        const { svg: renderedSvg } = await mermaid.render(id.current, chart);
        if (active) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
      }
    }
    renderChart();
    return () => {
      active = false;
    };
  }, [chart]);

  if (!svg) {
    return (
      <div className="mermaid mermaid-loading" id={id.current}>
        Rendering diagram...
      </div>
    );
  }

  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
