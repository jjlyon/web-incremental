import { TabName } from '../game/types';

type Props = {
  tab: TabName;
  active: boolean;
  hasAttention?: boolean;
  onClick: (tab: TabName) => void;
};

export const TabButton = ({ tab, active, hasAttention = false, onClick }: Props) => (
  <button className={active ? 'tab active' : 'tab'} onClick={() => onClick(tab)}>
    {tab}
    {hasAttention && <span className="tab-indicator" aria-label="Has available actions" />}
  </button>
);
