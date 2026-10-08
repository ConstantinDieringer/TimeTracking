import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

/**
 * Rolle und Inhaberschaft einer Person.
 *
 * Die Regeln selbst stehen in der Datenbank: der Inhaber bleibt per Trigger
 * Administrator und aktiv, übertragen kann nur er selbst. Diese Komponente
 * blendet nur aus, was ohnehin abgewiesen würde, und zeigt die Meldung der
 * Datenbank, falls doch etwas durchrutscht.
 */
export function Zugang({ employeeId, displayName }: { employeeId: string; displayName: string }) {
  const { profile, organization, isOwner, refresh } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const access = useQuery({
    queryKey: ['access', employeeId],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('role, active')
        .eq('id', employeeId)
        .single();
      if (queryError) throw queryError;
      return data;
    },
  });

  const targetIsOwner = organization?.owner_id === employeeId;
  const targetIsSelf = profile?.id === employeeId;

  async function afterChange() {
    void client.invalidateQueries({ queryKey: ['access', employeeId] });
    void client.invalidateQueries({ queryKey: ['overview'] });
    // Betrifft die Änderung die eigene Rolle oder das Unternehmen, muss die
    // Sitzung neu laden — sonst zeigte die Oberfläche noch alte Rechte.
    refresh();
  }

  async function changeRole(role: 'employee' | 'admin') {
    if (
      targetIsSelf &&
      role === 'employee' &&
      !window.confirm(
        'Sie entziehen sich selbst die Verwaltungsrechte. Zurückgeben kann sie Ihnen nur ein anderer Administrator. Fortfahren?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', employeeId);
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      toast.show(
        'success',
        role === 'admin'
          ? `${displayName} gehört jetzt zur Verwaltung`
          : `${displayName} ist jetzt Mitarbeiter`,
      );
      await afterChange();
    }
  }

  async function transferOwnership() {
    if (
      !window.confirm(
        `Die Inhaberschaft an ${displayName} übertragen? Sie bleiben Administrator, können die Übertragung aber nicht selbst rückgängig machen.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_ownership', {
      p_new_owner: employeeId,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else {
      toast.show('success', 'Inhaberschaft übertragen', `${displayName} ist jetzt Inhaber.`);
      await afterChange();
    }
  }

  if (!access.data) return null;

  return (
    <section className="section">
      <div className="section__head">
        <h2>Zugang</h2>
        {targetIsOwner && <span className="tag tag--muted">Inhaber</span>}
      </div>

      {targetIsOwner ? (
        <p className="muted">
          {targetIsSelf ? 'Sie sind' : `${displayName} ist`} Inhaber dieses Unternehmens: immer
          Administrator, weder herabstufbar noch deaktivierbar. Weitergeben kann die Inhaberschaft
          nur der Inhaber selbst.
        </p>
      ) : (
        <>
          <div className="form-grid">
            <div>
              <label htmlFor="z-rolle">Rolle</label>
              <select
                id="z-rolle"
                value={access.data.role}
                disabled={busy}
                onChange={(event) => void changeRole(event.target.value as 'employee' | 'admin')}
              >
                <option value="employee">Mitarbeiter</option>
                <option value="admin">Verwaltung</option>
              </select>
            </div>
          </div>
          <p className="muted editor__note">
            Die Verwaltung sieht und bearbeitet alle Mitarbeiter, Verträge und Zeiten dieses
            Unternehmens. Den Inhaber kann sie nicht herabstufen.
          </p>
          {isOwner && access.data.active && (
            <div className="row">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void transferOwnership()}
              >
                Inhaberschaft übertragen
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
