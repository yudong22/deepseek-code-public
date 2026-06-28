import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
});

export default function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const id = useRef(`mermaid-${Math.floor(Math.random() * 1000000)}`);

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
