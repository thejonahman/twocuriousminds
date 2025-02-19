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
                landingPage: "OVERVIEW",
                title: "AI Learning Assistant",
                subtitle: "Ask me questions about the video content!",
                position: "bottom-right",
                customStyles: {
                  bubbleIcon: {
                    innerHTML: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
                  }
                }
              },
              trigger: {
                color: "#FF6A27",
                label: "Ask AI Assistant"
              }
            };
          `
        }}
      />
      <Script
        id="delphi-bubble-bootstrap"
        src="https://embed.delphi.ai/loader.js"
      />
    </>
  );
}