import { useEffect } from "react";

interface ScriptProps {
  id: string;
  src?: string;
  dangerouslySetInnerHTML?: {
    __html: string;
  };
}

export default function Script({ id, src, dangerouslySetInnerHTML }: ScriptProps) {
  useEffect(() => {
    const existingScript = document.getElementById(id);
    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    if (src) {
      script.src = src;
    }
    if (dangerouslySetInnerHTML) {
      script.innerHTML = dangerouslySetInnerHTML.__html;
    }
    document.body.appendChild(script);

    return () => {
      const scriptToRemove = document.getElementById(id);
      if (scriptToRemove) {
        document.body.removeChild(scriptToRemove);
      }
    };
  }, [id, src, dangerouslySetInnerHTML]);

  return null;
}
