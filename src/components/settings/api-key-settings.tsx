"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function PasswordInput({ id, placeholder, className, value, onChange }: { id: string; placeholder?: string; className?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function ApiKeySettings() {
  const [keys, setKeys] = useState<{openai: string, anthropic: string, google: string}>({ openai: "", anthropic: "", google: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/apikeys")
      .then((res) => res.json())
      .then((data) => {
        if (data.keys) {
          setKeys({
            openai: data.keys.openai || "",
            anthropic: data.keys.anthropic || "",
            google: data.keys.google || "",
          });
        }
      })
      .catch((err) => console.error("Failed to load keys", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      if (!res.ok) throw new Error("Failed to save keys");
      toast.success("APIキーを保存しました。");
    } catch (err) {
      toast.error("APIキーの保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="openai-key">OpenAI API キー</Label>
          <PasswordInput
            id="openai-key"
            placeholder="sk-..."
            value={keys.openai}
            onChange={(e) => setKeys(prev => ({ ...prev, openai: e.target.value }))}
            className="font-mono bg-background"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="anthropic-key">Anthropic API キー</Label>
          <PasswordInput
            id="anthropic-key"
            placeholder="sk-ant-..."
            value={keys.anthropic}
            onChange={(e) => setKeys(prev => ({ ...prev, anthropic: e.target.value }))}
            className="font-mono bg-background"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="gemini-key">Gemini API キー</Label>
          <PasswordInput
            id="gemini-key"
            placeholder="AIza..."
            value={keys.google}
            onChange={(e) => setKeys(prev => ({ ...prev, google: e.target.value }))}
            className="font-mono bg-background"
          />
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button onClick={handleSave} disabled={loading || saving} className="w-full sm:w-auto">
          {saving ? "保存中..." : "保存する"}
        </Button>
      </div>
    </div>
  );
}
