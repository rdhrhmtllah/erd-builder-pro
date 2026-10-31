/**
 * The name a guest gives before joining the canvas's presence room.
 *
 * A public link has no account behind it, and an anonymous cursor is worse than
 * no cursor — "Tamu" twice tells nobody anything. The name lives in
 * sessionStorage, so a reload does not ask again and nothing is sent anywhere
 * except to the other people looking at the same diagram.
 *
 * The colour is not asked for: the relay assigns a free one so two people in the
 * same room never share it.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { normalizeGuestName } from '@/lib/collab/presence';

interface GuestNameDialogProps {
  /** Prefilled after a reload, when the same tab already had one. */
  initialName?: string;
  onJoin: (name: string) => void;
  /** Keep reading without appearing to anyone. */
  onSkip?: () => void;
}

export function GuestNameDialog({ initialName = '', onJoin, onSkip }: GuestNameDialogProps) {
  const [value, setValue] = useState(initialName);
  const name = normalizeGuestName(value);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name) return;
    onJoin(name);
  };

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} size="sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Your name on this diagram</DialogTitle>
            <DialogDescription>
              Other visitors see this name next to your cursor. Your cursor colour is picked
              automatically.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field>
              <FieldLabel
                htmlFor="guest-presence-name"
                className="px-1 text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase"
              >
                Name
              </FieldLabel>
              <Input
                id="guest-presence-name"
                type="text"
                value={value}
                maxLength={32}
                autoComplete="off"
                placeholder="e.g. Budi"
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            {onSkip && (
              <Button type="button" variant="ghost" className="h-9" onClick={onSkip}>
                Skip
              </Button>
            )}
            <Button type="submit" disabled={!name} className="h-9 px-6">
              Join
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
