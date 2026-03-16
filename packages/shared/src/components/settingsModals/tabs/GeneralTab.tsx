import React from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import { Switch } from "@shared/components/ui/switch";
import { Textarea } from "@shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/components/ui/select";
import { Checkbox } from "@shared/components/ui/checkbox";
import type { ServerSettingsValues } from "../../ServerSettingsModal";
import type { DeveloperAccessMode } from "@shared/lib/backend/types";
interface GeneralTabProps {
  values: ServerSettingsValues;

  canManageServer: boolean;
  canManageDeveloperAccess: boolean;
  channels: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  onValuesChange: (newValues: ServerSettingsValues) => void;
  onToggleChannel: (channelId: string) => void;
  onSave: () => Promise<void>;
  canShowChannelScopes: boolean;
}

export function GeneralTab({
  values,
  canManageServer,
  canManageDeveloperAccess,
  channels,
  saving,
  error,
  onValuesChange,
  onSave,
  canShowChannelScopes,
  onToggleChannel,
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

        <section className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-4">
          <h3 className="text-white font-semibold">Haven Developer Access</h3>
          <p className="text-sm text-[#a9b8cf]">
            Configure whether Haven developers can send official messages inside
            this community.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
            <Label
              htmlFor="developer-access-enabled"
              className="text-sm text-[#e6edf7]"
            >
              Enable Haven developer access
            </Label>
            <Switch
              id="developer-access-enabled"
              checked={values.developerAccessEnabled}
              onCheckedChange={(checked) =>
                onValuesChange({
                  ...values,
                  developerAccessEnabled: checked,
                })
              }
              disabled={!canManageDeveloperAccess}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Access Mode
            </Label>
            <Select
              value={values.developerAccessMode}
              onValueChange={(value) =>
                onValuesChange({
                  ...values,
                  developerAccessMode: value as DeveloperAccessMode,
                })
              }
              disabled={
                !canManageDeveloperAccess || !values.developerAccessEnabled
              }
            >
              <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                <SelectValue placeholder="Select access mode" />
              </SelectTrigger>
              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                <SelectItem value="report_only">Report Only</SelectItem>
                <SelectItem value="channel_scoped">Channel Scoped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canShowChannelScopes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#a9b8cf]">
                Allowed Channels
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-3 text-sm text-[#e6edf7] bg-[#111a2b] rounded-md p-2"
                  >
                    <Checkbox
                      id={`dev-channel-${channel.id}`}
                      checked={values.developerAccessChannelIds.includes(
                        channel.id,
                      )}
                      onCheckedChange={(checked) => {
                        if (checked === true || checked === false)
                          onToggleChannel(channel.id);
                      }}
                    />
                    <Label htmlFor={`dev-channel-${channel.id}`}>
                      #{channel.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!canManageDeveloperAccess && (
            <p className="text-xs text-[#d6a24a]">
              You can view this section, but only members with Manage Developer
              Access can change it.
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
    </div>
  );
}
