import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { useNotification } from "./Notification";

export const LinuxDoAuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const { loginWithToken } = useAuth();
  const { setNotification } = useNotification();
  const [status, setStatus] = useState("正在完成 Linux.do 登录...");

  useEffect(() => {
    if (handledRef.current) {
      return;
    }
    handledRef.current = true;

    const error = searchParams.get("error");
    const ticket = searchParams.get("ticket");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (error) {
      setStatus("Linux.do 登录失败，正在返回登录页...");
      setNotification({ message: error, type: "error" });
      window.setTimeout(() => navigate("/login", { replace: true }), 800);
      return;
    }

    const completeLogin = async (token: string, user: unknown, isNewUser: boolean) => {
      await loginWithToken(token, user as User);
      setNotification({
        message: isNewUser ? "Linux.do 注册并登录成功" : "Linux.do 登录成功",
        type: "success",
      });
      setStatus("登录成功，正在跳转...");

      window.setTimeout(() => {
        window.location.replace("/");
      }, 250);
    };

    const exchangeTicket = async (ticketValue: string) => {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/linuxdo/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ ticket: ticketValue }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Linux.do 登录失败");
      }

      await completeLogin(data.token, data.user, Boolean(data.isNewUser));
    };

    const submitCallbackForm = async (codeValue: string, stateValue: string) => {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/linuxdo/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        credentials: "include",
        body: new URLSearchParams({
          code: codeValue,
          state: stateValue,
        }).toString(),
      });

      const redirectedUrl = response.url ? new URL(response.url) : null;
      const redirectedError = redirectedUrl?.searchParams.get("error");
      if (redirectedError) {
        throw new Error(redirectedError);
      }

      const redirectedTicket = redirectedUrl?.searchParams.get("ticket");
      if (!redirectedTicket) {
        throw new Error("缺少 Linux.do 登录票据");
      }

      await exchangeTicket(redirectedTicket);
    };

    if (!ticket && !(code && state)) {
      setStatus("缺少 Linux.do 登录票据，正在返回登录页...");
      setNotification({ message: "缺少 Linux.do 登录票据", type: "error" });
      window.setTimeout(() => navigate("/login", { replace: true }), 800);
      return;
    }

    const finalizeLogin = async () => {
      try {
        if (ticket) {
          await exchangeTicket(ticket);
          return;
        }

        setStatus("正在提交 Linux.do 回调数据...");
        await submitCallbackForm(code!, state!);
      } catch (exchangeError) {
        const message =
          exchangeError instanceof Error ? exchangeError.message : "Linux.do 登录失败";
        setStatus("Linux.do 登录失败，正在返回登录页...");
        setNotification({ message, type: "error" });
        window.setTimeout(() => navigate("/login", { replace: true }), 800);
      }
    };

    void finalizeLogin();
  }, [loginWithToken, navigate, searchParams, setNotification]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-6 rounded-3xl">
      <div className="w-full max-w-md rounded-2xl border border-[#8ECAE6]/30 bg-white/85 p-8 text-center shadow-xl backdrop-blur-sm">
        <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-[#8ECAE6]/40 border-t-[#219EBC]" />
        <h1 className="text-2xl font-bold text-[#023047]">Linux.do OAuth</h1>
        <p className="mt-3 text-sm text-[#023047]/70">{status}</p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm text-[#023047]/50 hover:text-[#023047] transition-colors"
        >
          <FaArrowLeft className="h-3.5 w-3.5" />
          返回登录页
        </Link>
      </div>
    </div>
  );
};
