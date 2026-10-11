import { useEffect, useState } from "react";
import { BarChartOutlined, CarOutlined, CheckCircleOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Space, Spin, Statistic, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import apiRequest from "../../../lib/api.js";

const getPakistanDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const countTrips = (report) =>
  [report.trip1Image, report.trip2Image, report.trip3Image, report.trip4Image, report.trip5Image].filter(Boolean).length;

const metrics = [
  { key: "vehicles", label: "Total Vehicles", icon: CarOutlined, tone: "green" },
  { key: "archived", label: "Archived", icon: CheckCircleOutlined, tone: "teal" },
  { key: "trips", label: "Total Trips", icon: BarChartOutlined, tone: "blue" },
  { key: "notArchived", label: "Not Archived", icon: WarningOutlined, tone: "amber" },
];

const Home = () => {
  const navigate = useNavigate();
  const [today, setToday] = useState(getPakistanDate);
  const [reports, setReports] = useState([]);
  const [loadedDate, setLoadedDate] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((current) => {
        const currentDate = getPakistanDate();
        return currentDate === current ? current : currentDate;
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    apiRequest("/reports", { skipMemoryCache: refreshVersion > 0 })
      .then((data) => {
        if (!isMounted) return;
        setReports(data || []);
        setHasError(false);
        setLoadedDate(today);
      })
      .catch((error) => {
        if (!isMounted) return;
        setHasError(true);
        message.error(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshVersion]);

  const totalTrips = reports.reduce((total, report) => total + countTrips(report), 0);
  const archived = reports.filter((report) => countTrips(report) > 0).length;
  const notArchived = reports.length - archived;
  const values = {
    vehicles: reports.length,
    archived,
    trips: totalTrips,
    notArchived,
  };
  const isLoading = loadedDate !== today && !hasError;

  return (
    <section className="dashboard-overview">
      <div className="overview-heading">
        <div>
          <Typography.Text className="overview-eyebrow">DAILY OPERATIONS</Typography.Text>
          <Typography.Title level={3} className="overview-title">
            Today at a glance
          </Typography.Title>
          <Typography.Text className="overview-date">{today}</Typography.Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            aria-label="Refresh dashboard totals"
            title="Refresh totals"
            onClick={() => setRefreshVersion((version) => version + 1)}
          />
          <Button type="primary" onClick={() => navigate("/dashboard/users")}>
            Open vehicle records
          </Button>
        </Space>
      </div>

      {hasError ? (
        <Empty description="Could not load today's report totals" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" onClick={() => setRefreshVersion((version) => version + 1)}>
            Try again
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]} className="overview-metrics">
          {metrics.map(({ key, label, icon: Icon, tone }) => (
            <Col key={key} xs={24} sm={12} xl={6}>
              <Card className={`overview-metric overview-metric-${tone}`} bordered>
                <div className="overview-metric-topline">
                  <span className="overview-metric-icon">
                    <Icon />
                  </span>
                  <Typography.Text className="overview-metric-label">{label}</Typography.Text>
                </div>
                <Spin spinning={isLoading} size="small">
                  <Statistic value={values[key]} className="overview-statistic" />
                </Spin>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </section>
  );
};

export default Home;
