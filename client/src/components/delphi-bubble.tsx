import Script from "@/components/ui/script";

interface DelphiBubbleProps {
  videoId?: number;  // Make it optional since it's not used in the current implementation
}

export function DelphiBubble({ videoId }: DelphiBubbleProps) {
  return (
    <>
      <Script
        id="delphi-bubble-script"
        dangerouslySetInnerHTML={{
          __html: `
            window.delphi = {...(window.delphi ?? {}) };
            window.delphi.bubble = {
              config: "29e395c0-35fd-49b1-96f5-ecf9e3e4fab1",
              overrides: {
                landingPage: "CHAT",
              },
              trigger: {
                color: "#FF6A27",
              },
            };
          `,
        }}
      />
      <Script
        id="delphi-bubble-bootstrap"
        src="https://embed.delphi.ai/loader.js"
      />
    </>
  );
}