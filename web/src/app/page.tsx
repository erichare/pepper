import { CaseFile } from "@/components/dossier/CaseFile";
import { Constellation } from "@/components/dossier/Constellation";
import { HallOfFame } from "@/components/dossier/HallOfFame";
import { Hero } from "@/components/dossier/Hero";
import { HoursHeatmap } from "@/components/dossier/HoursHeatmap";
import { KarmaWaterfall } from "@/components/dossier/KarmaWaterfall";
import { Outro } from "@/components/dossier/Outro";
import { Receipt } from "@/components/dossier/Receipt";
import { TimelineChart } from "@/components/dossier/TimelineChart";
import { TopicBowl } from "@/components/dossier/TopicBowl";
import { VoiceGuideSection } from "@/components/dossier/VoiceGuideSection";

export default function Home() {
  return (
    <>
      <Hero />
      <Receipt />
      <TimelineChart />
      <KarmaWaterfall />
      <TopicBowl />
      <HoursHeatmap />
      <HallOfFame />
      <CaseFile />
      <Constellation />
      <VoiceGuideSection />
      <Outro />
    </>
  );
}
