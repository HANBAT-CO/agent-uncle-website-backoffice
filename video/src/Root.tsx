import "./fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { Promo16x9, promoSchema } from "./Promo16x9";
import { Promo9x16 } from "./Promo9x16";
import { HeroLoop, heroLoopSchema, LOOP_FRAMES } from "./HeroLoop";
import { FPS, MASTER, SOCIAL } from "./timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="AgentUncle">
      <Composition
        id="Promo16x9"
        component={Promo16x9}
        schema={promoSchema}
        durationInFrames={MASTER.total}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ hud: true, sfx: true }}
      />
      <Composition
        id="Promo9x16"
        component={Promo9x16}
        schema={promoSchema}
        durationInFrames={SOCIAL.total}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ hud: true, sfx: true }}
      />
      <Composition
        id="HeroLoop"
        component={HeroLoop}
        schema={heroLoopSchema}
        durationInFrames={LOOP_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ palette: "calm" as const }}
      />
    </Folder>
  );
};
