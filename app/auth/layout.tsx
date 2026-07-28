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
    <div className="auth-shell flex min-h-screen bg-movrr-bg-canvas">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="hidden flex-col justify-between bg-movrr-bg-primary p-12 text-movrr-text-inverse lg:flex lg:w-1/2"
      >
        <div>
          <div className="mb-8 flex items-center space-x-1">
            <div className="flex items-center justify-center p-1.5">
              <Image
                src="/movrr-icon-mark.png"
                alt="MOVRR Icon"
                width={50}
                height={50}
                sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 100vw"
                quality={100}
                priority
                aria-hidden="true"
              />
            </div>
            <span className="text-2xl font-bold uppercase">MOVRR</span>
          </div>
          <h1 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
            MOVRR Admin Operations Portal
          </h1>
          <p className="text-base opacity-90 md:text-lg">
            Internal access for campaign operations, rider oversight, route
            coordination, and platform administration.
          </p>
        </div>

        <div className="mb-16 space-y-8">
          <div className="flex items-center space-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-movrr-text-inverse/10">
              <span className="text-lg font-semibold">A</span>
            </div>
            <div>
              <h3 className="font-semibold">Admin-Gated Access</h3>
              <p className="opacity-80">
                Dashboard access is provisioned internally for authorized team
                members.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-movrr-text-inverse/10">
              <span className="text-lg font-semibold">O</span>
            </div>
            <div>
              <h3 className="font-semibold">Operations Control</h3>
              <p className="opacity-80">
                Manage riders, advertisers, campaigns, rewards, and routes from
                one surface.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-movrr-text-inverse/10">
              <span className="text-lg font-semibold">S</span>
            </div>
            <div>
              <h3 className="font-semibold">Security-Scoped Sessions</h3>
              <p className="opacity-80">
                Authentication, authorization, and audit controls are enforced
                for internal operators.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 items-center justify-center bg-movrr-bg-soft p-8"
      >
        <div className="w-full max-w-md rounded-xl border border-movrr-border-soft bg-movrr-bg-surface text-movrr-text-heading shadow-none">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
