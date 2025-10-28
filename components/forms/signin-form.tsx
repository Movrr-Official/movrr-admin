"use client";

import React, { useTransition, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ImSpinner8 } from "react-icons/im";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import z from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/supabase/client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";

const signInFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long.",
  }),
});

type SignInFormData = z.infer<typeof signInFormSchema>;

export function SignInForm() {
  const [isPending, startTransition] = useTransition();
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const form = useForm<SignInFormData>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { getValues, trigger, watch, control, handleSubmit } = form;

  const handleEmailSubmit = async () => {
    const isValid = await trigger("email");
    if (isValid) {
      setEmailSubmitted(true);
    }
  };

  const onSubmit = async (data: SignInFormData) => {
    setError("");

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();

        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (error) {
          setError(error.message);
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      } catch (error) {
        console.error("Error during sign in:", error);
        setError("An unexpected error occurred. Please try again.");
      }
    });
  };

  const emailValue = watch("email");

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!emailSubmitted ? (
          <>
            <FormField
              control={control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Email address
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter your email"
                      disabled={isPending}
                      className="bg-background border border-border-input"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && emailValue.trim()) {
                          e.preventDefault();
                          handleEmailSubmit();
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <Button
              type="button"
              className="w-full"
              disabled={
                isPending || !emailValue.trim() || !!form.formState.errors.email
              }
              onClick={handleEmailSubmit}
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border border-border-input dark:bg-input/30 dark:border-input h-9 px-4 py-2 text-sm">
              <p className="font-medium text-sm">{getValues("email")}</p>
              <button
                type="button"
                className="text-primary hover:text-primary/80 font-semibold transition-colors cursor-pointer"
                onClick={() => setEmailSubmitted(false)}
              >
                <Badge
                  variant="outline"
                  className="hover:bg-gray-200/80 dark:hover:bg-gray-800"
                >
                  Change
                </Badge>
              </button>
            </div>
            <FormField
              control={control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Password
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        {...field}
                        placeholder="Enter your password"
                        disabled={isPending}
                        className="bg-background border border-border-input"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-foreground/60 hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isPending}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <ImSpinner8 className="animate-spin h-4 w-4" />
                  Signing In...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </>
        )}
      </form>
    </Form>
  );
}
