import { useState } from "react";
import { Avatar, Button, Layout, Menu, Space, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";

import { items } from "./SidebarItems";

import DashboardRoutes from "./Routes";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext.js";
import "./Dashboard.scss";

const { Header, Content, Footer, Sider } = Layout;

const pageTitles = {
  "/dashboard": "Overview",
  "/dashboard/progress": "Progress",
  "/dashboard/users": "Workers & Reports",
};

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "A";

const Dashboard = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, handleLogout } = useAuthContext();

  const currentYear = new Date().getFullYear();
  const pageTitle = pageTitles[location.pathname] || "Operations";
  const fullName = user.fullName || "Administrator";
  const roleLabel = user.role === "superAdmin" ? "Super Admin" : "Team Member";

  return (
    <Layout className="dashboard-shell">
      <Sider
        className="dashboard-sidebar"
        breakpoint="lg"
        collapsible
        collapsed={collapsed}
        width={236}
        collapsedWidth={76}
        onCollapse={(value) => setCollapsed(value)}
      >
        <div className="dashboard-brand">
          <img
            src="/suthra-logo.webp"
            alt="Suthra Punjab"
            className="dashboard-brand-logo"
            style={{
              height: "42px",
              maxWidth: "58px",
              objectFit: "contain",
              borderRadius: "8px",
              background: "#ffffff",
              padding: "2px 4px",
            }}
          />
          <div className="dashboard-brand-copy">
            <Typography.Text className="dashboard-brand-name">SPA</Typography.Text>
            <Typography.Text className="dashboard-brand-caption">FIELD OPERATIONS</Typography.Text>
          </div>
        </div>
        <Typography.Text className="dashboard-nav-label">WORKSPACE</Typography.Text>
        <Menu
          className="dashboard-nav"
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
        <div className="dashboard-sidebar-account">
          <Avatar className="dashboard-avatar">{getInitials(fullName)}</Avatar>
          <div className="dashboard-sidebar-account-copy">
            <Typography.Text className="dashboard-account-name" ellipsis>
              {fullName}
            </Typography.Text>
            <Typography.Text className="dashboard-account-role">{roleLabel}</Typography.Text>
          </div>
        </div>
      </Sider>
      <Layout className="dashboard-main">
        <Header className="dashboard-header">
          <div className="dashboard-header-inner">
            <div className="dashboard-page-heading">
              <Typography.Text className="dashboard-eyebrow">SPA OKARA / OPERATIONS</Typography.Text>
              <Typography.Title className="dashboard-page-title" level={4}>
                {pageTitle}
              </Typography.Title>
            </div>
            <Space className="dashboard-header-actions" size={18}>
              <div className="dashboard-header-identity">
                <Avatar className="dashboard-avatar dashboard-header-avatar">{getInitials(fullName)}</Avatar>
                <div className="dashboard-header-account-copy">
                  <Typography.Text className="dashboard-account-name">{fullName}</Typography.Text>
                  <Typography.Text className="dashboard-account-role">{roleLabel}</Typography.Text>
                </div>
              </div>
              <Button
                className="dashboard-logout"
                icon={<LogoutOutlined />}
                aria-label="Sign out"
                onClick={() => {
                  handleLogout();
                  navigate("/auth/login");
                }}
              >
                Sign out
              </Button>
            </Space>
          </div>
        </Header>
        <Content className="dashboard-content">
          <div className="dashboard-content-inner">
            <DashboardRoutes />
          </div>
        </Content>
        <Footer className="dashboard-footer">
          SPA Field Operations <span>·</span> {currentYear}
        </Footer>
      </Layout>
    </Layout>
  );
};

export default Dashboard;
