"use client";
import { Button } from "@repo/ui/components/button";
import React from "react";

const Home = () => {
  return (
    <div className="text-center text-green-500 text-3xl p-5">
      Marketing page <br />
      <Button onClick={() => alert("hello")}>Click Me!</Button>
    </div>
  );
};

export default Home;
