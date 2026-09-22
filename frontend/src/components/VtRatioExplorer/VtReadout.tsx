import Tex from './Tex';
import { READOUT } from './vtReadout';
import type { VtModel } from './vtModel';

interface VtReadoutProps {
  model: VtModel;
}

export default function VtReadout({ model }: VtReadoutProps) {
  const cfg = READOUT[model.key];
  const rows = cfg.rows(model);

  return (
    <aside className="vt-readout">
      <div>
        <span className="vt-ro-label">比例结论</span>
        <div className="vt-ro-big">
          <Tex tex={cfg.big} display />
        </div>
        <div className="vt-ro-formula">
          <Tex tex={cfg.formula} display />
        </div>
      </div>
      <div>
        <span className="vt-ro-label">数值核对</span>
        <div className="vt-ro-scroll">
          <table className="vt-ro-table">
            <thead>
              <tr>
                <th>k</th>
                <th>{cfg.col2}</th>
                <th>比值</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td>{r.k}</td>
                  <td>{r.value}</td>
                  <td>{r.ratio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="vt-ro-note">{cfg.note}</p>
    </aside>
  );
}
