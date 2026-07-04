import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { queuePostRedirectNotification, useNotification } from "./Notification";

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
    const intent = searchParams.get("intent");
    const bindStatus = searchParams.get("status");
    const mergeToken = searchParams.get("mergeToken");

    if (error) {
      setStatus(intent === "bind" ? "Linux.do 绑定失败，正在返回个人主页..." : "Linux.do 登录失败，正在返回登录页...");
      setNotification({ message: error, type: "error" });
      window.setTimeout(() => navigate(intent === "bind" ? "/profile" : "/login", { replace: true }), 800);
      return;
    }

    if (intent === "bind") {
      if (bindStatus === "merge_required" && mergeToken) {
        setStatus("检测到账号冲突，正在打开合并预览...");
        setNotification({ message: "检测到该 Linux.do 账号已绑定其他本地账号，请查看合并预览", type: "warning" });
        window.setTimeout(() => navigate(`/profile?mergeToken=${encodeURIComponent(mergeToken)}`, { replace: true }), 500);
        return;
      }

      if (bindStatus === "bound" || bindStatus === "refreshed") {
        setStatus("Linux.do 绑定已完成，正在返回个人主页...");
        setNotification({
          message: bindStatus === "bound" ? "Linux.do 绑定成功" : "Linux.do 绑定信息已刷新",
          type: "success",
        });
        window.setTimeout(() => navigate("/profile", { replace: true }), 500);
        return;
      }

      if (bindStatus === "conflict") {
        setStatus("Linux.do 绑定存在冲突，正在返回个人主页...");
        setNotification({ message: "当前账户已绑定另一个 Linux.do 身份", type: "error" });
        window.setTimeout(() => navigate("/profile", { replace: true }), 800);
        return;
      }

      setStatus("Linux.do 绑定状态无效，正在返回个人主页...");
      setNotification({ message: "Linux.do 绑定状态无效", type: "error" });
      window.setTimeout(() => navigate("/profile", { replace: true }), 800);
      return;
    }

    const completeLogin = async (token: string, user: unknown, isNewUser: boolean) => {
      await loginWithToken(token, user as User);
      const successNotification = {
        message: isNewUser
          ? "Linux.do 注册并登录成功，您的注册用户密码凭据也已发到您对应的邮箱，请及时更改密码"
          : "Linux.do 登录成功",
        type: "success",
        duration: isNewUser ? 8000 : undefined,
      } as const;
      if (isNewUser) {
        queuePostRedirectNotification(successNotification);
      }
      setNotification(successNotification);
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

    if (!ticket) {
      setStatus("缺少 Linux.do 登录票据，正在返回登录页...");
      setNotification({ message: "缺少 Linux.do 登录票据", type: "error" });
      window.setTimeout(() => navigate("/login", { replace: true }), 800);
      return;
    }

    const finalizeLogin = async () => {
      try {
        await exchangeTicket(ticket);
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
        <h1 className="text-2xl font-bold text-[#023047]">正在登录 Linux.do</h1>
        <p className="mt-3 text-sm text-[#023047]/70">{status}</p>
        <p className="mt-2 text-xs leading-5 text-[#023047]/50">
          如果没有自动跳转，请返回登录页重试。
        </p>
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
