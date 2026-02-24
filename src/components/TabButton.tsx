import { TabName } from '../game/types';

type Props = {
  tab: TabName;
  active: boolean;
  onClick: (tab: TabName) => void;
};

export const TabButton = ({ tab, active, onClick }: Props) => (
  <button className={active ? 'tab active' : 'tab'} onClick={() => onClick(tab)}>
    {tab}
  </button>
);
