import PartyBar from './PartyBar';
import DamageBanner from './DamageBanner';
import PlayerPanel from './PlayerPanel';
import FieldPanel from './FieldPanel';
import EnemyPanel from './EnemyPanel';

export default function CalcPage() {
  return (
    <div className="calc-page">
      <PartyBar />
      <DamageBanner />
      <div className="calc-layout">
        <PlayerPanel />
        <FieldPanel />
        <EnemyPanel />
      </div>
    </div>
  );
}
