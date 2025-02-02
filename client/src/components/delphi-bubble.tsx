import Script from "@/components/ui/script";

export function DelphiBubble() {
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
