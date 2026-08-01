import { ImageResponse } from "next/og";

export const alt = "Queue Arcade — Dota side quests between matches";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DOTA_LOGO = "https://cdn.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          alignItems: "center",
          padding: "72px 84px",
          background:
            "radial-gradient(circle at 83% 8%, rgba(175,54,43,.4), transparent 36%), radial-gradient(circle at 8% 92%, rgba(64,123,117,.28), transparent 38%), #090b0c",
          color: "#f1f0ea",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "28px",
            display: "flex",
            border: "1px solid rgba(220,225,220,.13)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", width: "850px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              color: "#f08a78",
              fontSize: "22px",
              fontWeight: 700,
              letterSpacing: "5px",
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: "58px",
                height: "58px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,124,105,.6)",
                background: "linear-gradient(145deg, #9e322b, #4b1815)",
              }}
            >
              <img src={DOTA_LOGO} alt="" width={44} height={44} />
            </div>
            Queue Arcade
          </div>
          <div
            style={{ display: "flex", marginTop: "52px", fontSize: "72px", lineHeight: 1.02, letterSpacing: "-4px" }}
          >
            Your queue has side quests.
          </div>
          <div style={{ display: "flex", marginTop: "28px", color: "#aeb3b1", fontSize: "27px" }}>
            Dota knowledge. One live room. Endless synchronized rounds.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: "58px",
            bottom: "48px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "#79c98e",
            fontSize: "18px",
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          <span style={{ display: "flex", width: "9px", height: "9px", borderRadius: "50%", background: "#79c98e" }} />
          Public arcade live
        </div>
      </div>
    ),
    size,
  );
}
