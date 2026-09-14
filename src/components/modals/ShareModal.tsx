import React, { useState } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { shareLinkState, type ShareSettings } from "@/lib/share-link-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, Check, Share2, Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: 'erd' | 'notes' | 'drawings' | 'flowchart';
  documentUid: string;
  documentId: number | string;
  documentTitle: string;
  isPublicView?: boolean;
  initialSettings?: {
    is_public: boolean;
    share_token?: string;
    expiry_date?: string;
  };
  onSettingsSaved?: () => void;
}

export function ShareModal({
  isOpen,
  onOpenChange,
  documentType,
  documentUid,
  documentId,
  documentTitle,
  isPublicView = false,
  initialSettings,
  onSettingsSaved
}: ShareModalProps) {
  const [token, setToken] = React.useState(initialSettings?.share_token || '');
  const [isCopied, setIsCopied] = React.useState(false);
  const [isPublic, setIsPublic] = React.useState(initialSettings?.is_public || false);
  const [durationDays, setDurationDays] = React.useState<string>('');
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize duration from expiry_date if available
  React.useEffect(() => {
    if (initialSettings?.expiry_date) {
      const expiry = new Date(initialSettings.expiry_date);
      const now = new Date();
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) setDurationDays(diffDays.toString());
    }
    setToken(initialSettings?.share_token || '');
    setIsPublic(initialSettings?.is_public || false);
  }, [initialSettings]);

  // Map drawing to drawings for URL consistency
  // Map internal types to professional URL type names
  const urlTypeMap: Record<string, string> = {
    erd: 'diagram',
    notes: 'note',
    drawings: 'drawing',
    flowchart: 'flowchart'
  };
  const urlType = urlTypeMap[documentType] || documentType;
  
  const shareUrl = `${window.location.origin}/view/${urlType}/${documentUid}`;

  const savedDurationDays = React.useMemo(() => {
    if (!initialSettings?.expiry_date) return '';
    const days = Math.ceil((new Date(initialSettings.expiry_date).getTime() - Date.now()) / 86_400_000);
    return days > 0 ? String(days) : '';
  }, [initialSettings?.expiry_date]);

  const [savedSettings, setSavedSettings] = React.useState<ShareSettings>({
    isPublic: Boolean(initialSettings?.is_public),
    token: initialSettings?.share_token || '',
    durationDays: savedDurationDays,
  });

  // The parent refreshes projects, not the document list, so the acknowledged
  // state has to come from this modal's own save. This only re-seeds it when the
  // document being shared changes.
  React.useEffect(() => {
    setSavedSettings({
      isPublic: Boolean(initialSettings?.is_public),
      token: initialSettings?.share_token || '',
      durationDays: savedDurationDays,
    });
  }, [documentUid, initialSettings?.is_public, initialSettings?.share_token, savedDurationDays]);

  const draftSettings: ShareSettings = { isPublic: Boolean(isPublic), token, durationDays };
  // A public-view visitor already holds a link that works; only the owner's
  // unsaved edits can produce one that does not.
  const linkState = isPublicView
    ? { canCopy: true as const, notice: null }
    : shareLinkState(savedSettings, draftSettings);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const generateToken = () => {
    const newToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    setToken(newToken);
    toast.info("Secure token generated");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const endpoint = documentType === 'erd' ? 'diagrams' : (documentType === 'flowchart' ? 'flowcharts' : documentType);
      
      let expiry_date = null;
      if (durationDays && !isNaN(parseInt(durationDays))) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(durationDays));
        expiry_date = d.toISOString();
      }

      const res = await apiFetch(`/api/${endpoint}/${documentId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_public: isPublic,
          share_token: token,
          expiry_date
        })
      });

      if (!res.ok) throw new Error("Failed to save settings");

      setSavedSettings(draftSettings);
      toast.success(isPublic ? "Published — the link is ready to copy" : "Sharing settings updated!");
      if (onSettingsSaved) onSettingsSaved();
      if (!isPublic) onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPublicView ? "Share Document" : `Share "${documentTitle}"`}</DialogTitle>
          <DialogDescription>
            {isPublicView 
              ? "Share this link with others to view this document."
              : isPublic 
                ? "Anyone with this link can view this document. No account required." 
                : "This document is currently private. Only you can access it."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!isPublicView && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 transition-colors hover:bg-muted/50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {isPublic ? <Globe className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                  <Label htmlFor="public-status" className="text-sm font-bold">Public Access</Label>
                </div>
                <p className="text-[11px] text-muted-foreground">Enable sharing via public link</p>
              </div>
              <Checkbox
                id="public-status"
                checked={isPublic}
                onCheckedChange={checked => setIsPublic(checked)}
              />
            </div>
          )}

          <div className={`space-y-4 transition-all duration-300 ${(isPublic || isPublicView) ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale-[0.5]'}`}>
            <div className="space-y-2">
              <Label htmlFor="share-link" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Public Link</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="share-link"
                  readOnly 
                  value={shareUrl} 
                  className="flex-1 bg-muted/20 font-mono text-xs"
                />
                <Button 
                  onClick={handleCopy} 
                  size="icon" 
                  variant="outline"
                  className="shrink-0 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                  disabled={!linkState.canCopy}
                >
                  {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              {linkState.notice && (
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500">{linkState.notice}</p>
              )}
            </div>

            {!isPublicView && (
              <>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="access-token" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access Token (Optional)</Label>
                    <Button 
                      variant="link" 
                      size="sm" 
                      onClick={generateToken}
                      className="h-auto p-0 text-[10px] uppercase font-bold tracking-tighter cursor-pointer text-primary hover:no-underline"
                      disabled={!isPublic}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Generate
                    </Button>
                  </div>
                  <Input 
                    id="access-token"
                    placeholder="Enter or generate a token..." 
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={!isPublic}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="valid-until" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration (Days)</Label>
                  <Input 
                    id="valid-until"
                    type="number"
                    placeholder="Forever"
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    disabled={!isPublic}
                    className="text-xs"
                  />
                </div>
              </>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          {isPublicView ? (
            <Button 
              type="button" 
              onClick={() => onOpenChange(false)}
              className="cursor-pointer w-full sm:w-auto font-bold"
            >
              Close
            </Button>
          ) : (
            <>
              <Button 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="cursor-pointer order-2 sm:order-1 font-semibold"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={handleSave}
                className="cursor-pointer order-1 sm:order-2 font-bold min-w-[120px]"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : "Save Changes"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
