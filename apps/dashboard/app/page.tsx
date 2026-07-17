import React from "react";
import { Button } from "@repo/ui/components/button";

const page = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-5xl text-red-500">Dashboard Page</h1> <br />
      <Button>Shared shadcn button</Button>
    </main>
  );
};

export default page;
