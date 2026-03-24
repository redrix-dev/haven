import React from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import { Switch } from "@shared/components/ui/switch";
import { Textarea } from "@shared/components/ui/textarea";
import type { ServerSettingsValues } from "../../ServerSettingsModal";
interface GeneralTabProps {
  values: ServerSettingsValues;
  canManageServer: boolean;
  saving: boolean;
  error: string | null;
  onValuesChange: (newValues: ServerSettingsValues) => void;
  onSave: () => Promise<void>;
}

export function GeneralTab({
  values,
  canManageServer,
  saving,
  error,
  onValuesChange,
  onSave,
}: GeneralTabProps) {
  return (
    <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-4">
          <h3 className="text-white font-semibold">General</h3>
          <div className="space-y-2">
            <Label
              htmlFor="server-settings-name"
              className="text-xs font-semibold uppercase text-[#a9b8cf]"
            >
              Community Name
            </Label>
            <Input
              id="server-settings-name"
              value={values.name}
              onChange={(e) =>
                onValuesChange({ ...values, name: e.target.value })
              }
              className="bg-[#142033] border-[#304867] text-white"
              maxLength={100}
              required
              disabled={!canManageServer}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="server-settings-description"
              className="text-xs font-semibold uppercase text-[#a9b8cf]"
            >
              Description
            </Label>
            <Textarea
              id="server-settings-description"
              value={values.description ?? ""}
              onChange={(e) =>
                onValuesChange({
                  ...values,
                  description: e.target.value,
                })
              }
              className="min-h-24 bg-[#142033] border-[#304867] text-white"
              maxLength={500}
              placeholder="Tell people what this community is about."
              disabled={!canManageServer}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
            <Label
              htmlFor="allow-public-invites"
              className="text-sm text-[#e6edf7]"
            >
              Allow public invites
            </Label>
            <Switch
              id="allow-public-invites"
              checked={values.allowPublicInvites}
              onCheckedChange={(checked) =>
                onValuesChange({
                  ...values,
                  allowPublicInvites: checked,
                })
              }
              disabled={!canManageServer}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
            <Label
              htmlFor="require-report-reason"
              className="text-sm text-[#e6edf7]"
            >
              Require a reason when submitting support reports
            </Label>
            <Switch
              id="require-report-reason"
              checked={values.requireReportReason}
              onCheckedChange={(checked) =>
                onValuesChange({
                  ...values,
                  requireReportReason: checked,
                })
              }
              disabled={!canManageServer}
            />
          </div>
          {!canManageServer && (
            <p className="text-xs text-[#d6a24a]">
              You can view these settings, but only members with Manage
              Community can edit them.
            </p>
          )}
        </section>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[#233753] pt-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={saving || !canManageServer}
            className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            onClick={() => void onSave()}
          >
            {saving ? "Saving..." : "Save General Settings"}
          </Button>
        </div>
      </div>
      {/* CHECKPOINT 2 COMPLETE */}
    </div>
  );
}
