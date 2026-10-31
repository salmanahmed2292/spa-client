import { useEffect, useState } from "react";
import {
  BarChartOutlined,
  CarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Empty, Form, Input, Modal, Progress as AntProgress, Row, Spin, Statistic, Typography, message } from "antd";
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

const getTripCount = (report) =>
  [report.trip1Image, report.trip2Image, report.trip3Image, report.trip4Image, report.trip5Image].filter(Boolean).length;

const amoColors = [
  { name: "haq nawaz", color: "#CCC0DA" },
  { name: "fiaz", color: "#92CDDC" },
  { name: "ahsan", color: "#FABF8F" },
  { name: "gazanfar", color: "#92D050" },
  { name: "adeel", color: "#DA9694" },
];

const getAmoColor = (amo) => {
  const amoKey = String(amo || "Unassigned AMO")
    .trim()
    .toLocaleLowerCase();
  return amoColors.find(({ name }) => amoKey.includes(name))?.color || "#F2F3F5";
};

const Progress = () => {
  const [today, setToday] = useState(getPakistanDate);
  const [reports, setReports] = useState([]);
  const [loadedDate, setLoadedDate] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [amoForm] = Form.useForm();
  const [isAmoModalOpen, setIsAmoModalOpen] = useState(false);
  const [editingAmo, setEditingAmo] = useState(null);
  const [isSavingAmo, setIsSavingAmo] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((current) => {
        const date = getPakistanDate();
        return date === current ? current : date;
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
        setLoadedDate(today);
        setHasError(false);
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

  const handleEditAmo = (group) => {
    setEditingAmo(group.amo);
    amoForm.setFieldsValue({
      amo: group.amo,
    });
    setIsAmoModalOpen(true);
  };

  const handleAmoModalCancel = () => {
    setIsAmoModalOpen(false);
    setEditingAmo(null);
    amoForm.resetFields();
  };

  const handleAmoSubmit = async () => {
    try {
      const values = await amoForm.validateFields();
      const oldAmo = editingAmo;
      const newAmo = values.amo.trim();

      setIsSavingAmo(true);
      await apiRequest("/reports/amo/update", {
        method: "PATCH",
        body: {
          oldAmo,
          newAmo,
        },
      });

      setReports((current) =>
        current.map((item) => {
          if ((item.amo || "").trim() === oldAmo) {
            return {
              ...item,
              amo: newAmo,
            };
          }
          return item;
        }),
      );

      message.success(`AMO updated to "${newAmo}" successfully!`);
      setIsAmoModalOpen(false);
      setEditingAmo(null);
      amoForm.resetFields();
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.message || "Failed to update AMO.");
    } finally {
      setIsSavingAmo(false);
    }
  };

  const groups = [
    ...reports
      .reduce((byAmo, report) => {
        const amo = report.amo?.trim() || "Unassigned AMO";
        const group = byAmo.get(amo) || { amo, vehicles: 0, archived: 0, trips: 0 };
        const tripCount = getTripCount(report);
        group.vehicles += 1;
        group.trips += tripCount;
        if (tripCount > 0) group.archived += 1;
        byAmo.set(amo, group);
        return byAmo;
      }, new Map())
      .values(),
  ].sort((left, right) => left.amo.localeCompare(right.amo, undefined, { sensitivity: "base" }));

  const totalVehicles = reports.length;
  const totalArchived = groups.reduce((total, group) => total + group.archived, 0);
  const totalTrips = groups.reduce((total, group) => total + group.trips, 0);
  const pendingVehicles = totalVehicles - totalArchived;

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("AMO Progress");
      const border = { style: "thin", color: { argb: "FF000000" } };
      const exportHeaders = ["Sr.#", "AMO", "Total Vehicles", "Archived", "Trips Uploaded", "Percentage", "Status"];
      const rows = groups.map((group, index) => {
        const percentage = group.vehicles ? Math.round((group.archived / group.vehicles) * 100) : 0;
        return [
          index + 1,
          group.amo,
          group.vehicles,
          group.archived,
          group.trips,
          `${percentage}%`,
          percentage === 100 ? "Complete" : percentage > 0 ? "In Progress" : "Pending",
        ];
      });

      worksheet.columns = exportHeaders.map((header, index) => ({
        header,
        key: `column${index + 1}`,
        width: [8, 28, 20, 16, 20, 16, 18][index],
      }));
      worksheet.mergeCells("A1:D1");
      worksheet.mergeCells("E1:G1");
      worksheet.getCell("A1").value = "Daily AMO progress report";
      worksheet.getCell("A1").font = { name: "Times New Roman", bold: true, size: 20 };
      worksheet.getCell("A1").alignment = { horizontal: "left", vertical: "middle" };
      worksheet.getCell("E1").value = `Date: ${today}`;
      worksheet.getCell("E1").font = { name: "Times New Roman", bold: true, size: 14 };
      worksheet.getCell("E1").alignment = { horizontal: "right", vertical: "middle" };
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      });
      worksheet.getRow(1).height = 60;

      const headerRow = worksheet.getRow(2);
      headerRow.values = exportHeaders;
      headerRow.height = 50;
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: "Times New Roman", bold: true, size: 14 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC4D79B" } };
        cell.border = { top: border, right: border, bottom: border, left: border };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });

      rows.forEach((values, index) => {
        const row = worksheet.getRow(index + 3);
        row.values = values;
        row.height = 36;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: "Times New Roman", bold: true, size: 14 };
          cell.border = { top: border, right: border, bottom: border, left: border };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });
        row.getCell(2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: getAmoColor(values[1]).replace("#", "FF") },
        };
      });

      const totalRow = worksheet.getRow(Math.max(2, rows.length + 2) + 1);
      totalRow.height = 50;
      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: "Times New Roman", bold: true, size: 14 };
        cell.border = { top: border, right: border, bottom: border, left: border };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      worksheet.mergeCells(`A${totalRow.number}:B${totalRow.number}`);
      worksheet.getCell(`A${totalRow.number}`).value = "Grand Total";
      worksheet.getCell(`A${totalRow.number}`).font = { name: "Times New Roman", bold: true, size: 14 };
      worksheet.getCell(`A${totalRow.number}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      worksheet.getCell(`A${totalRow.number}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFC0CB" },
      };
      [totalVehicles, totalArchived, totalTrips].forEach((value, index) => {
        const cell = worksheet.getCell(totalRow.number, index + 3);
        cell.value = value;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF87CEEB" } };
        cell.font = { name: "Times New Roman", bold: true, size: 20 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      const percentageCell = worksheet.getCell(totalRow.number, 6);
      percentageCell.value = totalVehicles
        ? `${Math.round((totalArchived / totalVehicles) * 100)}%`
        : "0%";
      percentageCell.font = { name: "Times New Roman", bold: true, size: 20 };
      percentageCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF87CEEB" } };
      percentageCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      worksheet.getCell(totalRow.number, 7).value = "Daily total";
      worksheet.getCell(`A${totalRow.number}`).font = { name: "Times New Roman", bold: true, size: 14 };
      worksheet.getCell(`A${totalRow.number}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      worksheet.views = [{ state: "frozen", ySplit: 2, topLeftCell: "A3", showGridLines: true }];
      worksheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printArea: `A1:G${totalRow.number}`,
        printTitlesRow: "2:2",
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `AMO-Progress-${today}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      message.success("Excel exported successfully.");
    } catch {
      message.error("Unable to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = loadedDate !== today && !hasError;

  return (
    <main className="progress-page">
      <Row className="progress-top-header" align="middle" justify="space-between">
        <Col>
          <h3 className="fw-bold m-0 text-center text-success">Suthra Punjab Agency (SPA) OKARA</h3>
        </Col>
        <Col>
          <div className="progress-header-actions">
            <div className="fw-semibold">Today · {today}</div>
            <div className="progress-action-buttons">
              <Button icon={<FileExcelOutlined />} loading={isExporting} onClick={handleExportExcel}>
                Export Excel
              </Button>
              <Button
                icon={<ReloadOutlined />}
                aria-label="Refresh AMO progress"
                title="Refresh progress"
                onClick={() => setRefreshVersion((version) => version + 1)}
              >
                Refresh
              </Button>
            </div>
          </div>
        </Col>
      </Row>

      <div className="progress-heading">
        <div>
          <Typography.Text className="overview-eyebrow">AMO PERFORMANCE</Typography.Text>
          <Typography.Title level={3} className="overview-title">
            Daily report progress
          </Typography.Title>
          <Typography.Text className="overview-date">
            {today} · {groups.length} AMOs
          </Typography.Text>
        </div>
      </div>

      {hasError ? (
        <Empty description="Could not load today's AMO progress" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" onClick={() => setRefreshVersion((version) => version + 1)}>
            Try again
          </Button>
        </Empty>
      ) : isLoading ? (
        <div className="progress-loading">
          <Spin size="large" />
        </div>
      ) : groups.length === 0 ? (
        <Empty description="No vehicle reports for today" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Row gutter={[16, 16]} className="progress-summary">
            {[
              { label: "Total Vehicles", value: totalVehicles, icon: CarOutlined, tone: "green" },
              { label: "Archived", value: totalArchived, icon: CheckCircleOutlined, tone: "teal" },
              { label: "Trips Uploaded", value: totalTrips, icon: BarChartOutlined, tone: "blue" },
              { label: "Pending", value: pendingVehicles, icon: WarningOutlined, tone: "amber" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <Col key={label} xs={24} sm={12} xl={6}>
                <Card className={`overview-metric overview-metric-${tone}`} bordered>
                  <div className="overview-metric-topline">
                    <span className="overview-metric-icon">
                      <Icon />
                    </span>
                    <Typography.Text className="overview-metric-label">{label}</Typography.Text>
                  </div>
                  <Statistic value={value} className="overview-statistic" />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[16, 16]}>
            {groups.map((group) => {
              const percentage = group.vehicles ? Math.round((group.archived / group.vehicles) * 100) : 0;
              const status =
                percentage === 100
                  ? "complete"
                  : percentage >= 50
                    ? "on-track"
                    : percentage > 0
                      ? "in-progress"
                      : "pending";
              const ringColors = {
                complete: "#4f7d56",
                "on-track": "#477895",
                "in-progress": "#b17a32",
                pending: "#a45b55",
              };
              return (
                <Col key={group.amo} xs={24} md={12} xxl={8}>
                  <Card className={`progress-amo-card progress-amo-card-${status}`} bordered>
                    <div className="progress-amo-card-heading">
                      <div className="progress-amo-identity">
                        <span className="progress-amo-icon">
                          <TeamOutlined />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <Typography.Text className="progress-amo-label">AMO</Typography.Text>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ color: "#1677ff", fontSize: "13px" }} />}
                              onClick={() => handleEditAmo(group)}
                              title="Edit AMO"
                              style={{ padding: "0 6px", height: "22px", borderRadius: "4px" }}
                            >
                              <span style={{ fontSize: "11px", color: "#1677ff", marginLeft: 2 }}>Edit</span>
                            </Button>
                          </div>
                          <Typography.Title
                            level={5}
                            className="progress-amo-name"
                            style={{ borderLeft: `5px solid ${getAmoColor(group.amo)}` }}
                          >
                            {group.amo}
                          </Typography.Title>
                        </div>
                      </div>
                      <AntProgress
                        type="circle"
                        percent={percentage}
                        size={68}
                        strokeColor={ringColors[status]}
                        trailColor="#e8ede6"
                        format={(value) => <span className="progress-ring-label">{value}%</span>}
                      />
                    </div>
                    <div className="progress-amo-stats">
                      <Statistic title="Vehicles" value={group.vehicles} />
                      <Statistic title="Archived" value={group.archived} />
                      <Statistic title="Trips uploaded" value={group.trips} />
                    </div>
                    <div className="progress-amo-ratio">
                      <span>Archive ratio</span>
                      <strong>
                        {group.archived} / {group.vehicles} vehicles
                      </strong>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </>
      )}

      {/* Modal to edit AMO */}
      <Modal
        title={`Edit AMO: ${editingAmo || ""}`}
        open={isAmoModalOpen}
        onOk={handleAmoSubmit}
        onCancel={handleAmoModalCancel}
        confirmLoading={isSavingAmo}
        okText="Update AMO"
        width={500}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, color: "#666", fontSize: "13px", lineHeight: "1.5" }}>
          Editing this AMO will update all associated vehicle records in the database and automatically reflect on the <strong>Users/Workers</strong> page.
        </div>
        <Form form={amoForm} layout="vertical">
          <Form.Item
            name="amo"
            label="AMO Name & Contact"
            rules={[{ required: true, message: "Please enter AMO name & contact" }]}
          >
            <Input placeholder="e.g. Haq Nawaz 0345-7538817" />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
};

export default Progress;
