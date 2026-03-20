"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ApiKeySettings } from "@/components/settings/api-key-settings";

export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">API キー</h2>
          <div className="text-muted-foreground mt-2">
            各AIサービスを利用するためのAPI キーを入力してください。
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="lg:w-1/4">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
            <Button variant="secondary" className="justify-start">
              API キー
            </Button>
            <Button variant="ghost" className="justify-start">
              一般設定
            </Button>
          </nav>
        </aside>

        <div className="flex-1 lg:max-w-2xl">
          <ApiKeySettings />
        </div>
      </div>
    </div>
  );
}
