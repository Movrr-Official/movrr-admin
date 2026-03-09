"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 p-12 text-white flex-col justify-between"
      >
        <div>
          <div className="flex items-center space-x-1 mb-8">
            <div className="p-1.5 flex items-center justify-center">
              <Image
                src="/movrr-icon.png"
                alt="Movrr Icon"
                width={50}
                height={50}
                sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 100vw"
                quality={100}
                priority
                aria-hidden="true"
              />
            </div>
            <span className="text-2xl uppercase font-bold">Movrr</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            MOVRR Admin Operations Portal
          </h1>
          <p className="text-xl opacity-90">
            Internal access for campaign operations, rider oversight, route
            coordination, and platform administration.
          </p>
        </div>

        <div className="space-y-8 mb-16">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg font-semibold">A</span>
            </div>
            <div>
              <h3 className="font-semibold">Admin-Gated Access</h3>
              <p className="opacity-80">
                Dashboard access is provisioned internally for authorized team members.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg font-semibold">O</span>
            </div>
            <div>
              <h3 className="font-semibold">Operations Control</h3>
              <p className="opacity-80">
                Manage riders, advertisers, campaigns, rewards, and routes from one surface.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg font-semibold">S</span>
            </div>
            <div>
              <h3 className="font-semibold">Security-Scoped Sessions</h3>
              <p className="opacity-80">
                Authentication, authorization, and audit controls are enforced for internal operators.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-muted/50 flex-1 flex items-center justify-center p-8"
      >
        <div className="w-full max-w-md">{children}</div>
      </motion.div>
    </div>
  );
}
