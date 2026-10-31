import { useEffect, useRef, useState } from "react";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  FileExcelOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Modal, Col, Row, Space, Table, Form, Input, Upload, Tag, message, Popconfirm } from "antd";
import apiRequest from "../../../lib/api.js";
import prepareImageUpload from "../../../lib/prepareImageUpload.js";

const getPakistanDate = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.day}-${values.month}-${values.year}`;
};

const normalizeReport = (report, index) => ({ ...report, key: report._id, sr: index + 1 });

const exportHeaders = [
  "Sr.#",
  "AMO",
  "UC",
  "Supervisor Name & #",
  "Vehicle / Rickshaw No",
  "Trip 01",
  "Trip 02",
  "Trip 03",
  "Trip 04",
  "Trip 05",
  "Total Trips",
  "Trip Archived",
  "Remarks",
];

const addExcelImage = async (workbook, imageUrl) => {
  const secureUrl = imageUrl.replace(/^http:\/\//i, "https://");
  const response = await fetch(secureUrl, { mode: "cors" });
  if (!response.ok) throw new Error("Unable to download report image.");

  let blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" }).catch(() => null);
  const width = bitmap?.width || 120;
  const height = bitmap?.height || 80;
  let extension = blob.type === "image/jpeg" || blob.type === "image/jpg" ? "jpeg" : blob.type.split("/")[1];

  if (extension !== "jpeg" && extension !== "png") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Unable to process report image.");
    if (bitmap) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0);
    }
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (imageBlob) => (imageBlob ? resolve(imageBlob) : reject(new Error("Unable to process report image."))),
        "image/png",
        1.0,
      );
    });
    extension = "png";
  }
  if (bitmap) bitmap.close();

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  return { imageId: workbook.addImage({ base64, extension }), width, height };
};

const makeColumnFilters = (records, getValue) => {
  const values = [...new Set(records.map((record) => String(getValue(record) ?? "")))].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    filters: values.map((value) => ({ text: value || "(blank)", value })),
    filterSearch: values.length > 6,
    onFilter: (value, record) => String(getValue(record) ?? "") === value,
  };
};

const Users = () => {
  const [form] = Form.useForm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [todayDate, setTodayDate] = useState(getPakistanDate);
  const [uploadingImages, setUploadingImages] = useState({});
  const [imagePreviews, setImagePreviews] = useState({});
  const previewUrls = useRef(new Set());
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const sortedReports = [...reports].sort((left, right) => {
    const amoOrder = String(left.amo || "").localeCompare(String(right.amo || ""), undefined, {
      sensitivity: "base",
    });
    if (amoOrder) return amoOrder;
    const ucOrder = String(left.uc || "").localeCompare(String(right.uc || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return (
      ucOrder ||
      String(left.vehicleNo || "").localeCompare(String(right.vehicleNo || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  });
  const visibleDataSource = isLoading ? [] : sortedReports.map((report, index) => ({ ...report, sr: index + 1 }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTodayDate((currentDate) => {
        const nextDate = getPakistanDate();
        return nextDate === currentDate ? currentDate : nextDate;
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    apiRequest("/reports", { skipMemoryCache: refreshVersion > 0 })
      .then((data) => {
        if (!isMounted) return;
        setReports((data || []).map(normalizeReport));
        setIsLoading(false);
      })
      .catch((error) => {
        if (isMounted) {
          message.error(error.message);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshVersion]);

  const handleTableCellImageUpload = async (file, recordKey, tripField) => {
    const uploadKey = `${recordKey}:${tripField}`;
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.add(previewUrl);
    setImagePreviews((current) => ({ ...current, [uploadKey]: previewUrl }));
    setUploadingImages((current) => ({ ...current, [uploadKey]: null }));

    try {
      const imageEndpoint = `/reports/${recordKey}/images/${tripField}`;
      const optimizedFile = await prepareImageUpload(file);
      setUploadingImages((current) => ({ ...current, [uploadKey]: true }));
      const formData = new FormData();
      formData.append("image", optimizedFile);
      const updatedReport = await apiRequest(imageEndpoint, {
        method: "POST",
        body: formData,
      });

      setReports((current) =>
        current.map((item) => (item.key === recordKey ? { ...updatedReport, key: recordKey, sr: item.sr } : item)),
      );
      message.success("Image uploaded successfully!");
    } catch (error) {
      message.error(`Image upload failed: ${error.message}`);
    } finally {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(previewUrl);
      setImagePreviews((current) => {
        const next = { ...current };
        delete next[uploadKey];
        return next;
      });
      setUploadingImages((current) => {
        const next = { ...current };
        delete next[uploadKey];
        return next;
      });
    }
    return false;
  };

  const handleRemoveImage = async (recordKey, tripField) => {
    const currentReport = reports.find((item) => item.key === recordKey);
    if (!currentReport) return;
    const previousImage = currentReport[tripField];

    setReports((current) => current.map((item) => (item.key === recordKey ? { ...item, [tripField]: null } : item)));

    try {
      const updatedReport = await apiRequest(`/reports/${recordKey}/images/${tripField}`, { method: "DELETE" });
      setReports((current) =>
        current.map((item) => (item.key === recordKey ? { ...updatedReport, key: recordKey, sr: item.sr } : item)),
      );
      message.success("Image removed.");
    } catch (error) {
      setReports((current) =>
        current.map((item) => (item.key === recordKey ? { ...item, [tripField]: previousImage } : item)),
      );
      message.error(error.message);
    }
  };

  // Render Image Cell inside Table
  const renderTableImageCell = (imageUrl, record, tripField, tripLabel) => {
    const uploadKey = `${record.key}:${tripField}`;
    const uploadProgress = uploadingImages[uploadKey];
    const isUploading = uploadProgress !== undefined;
    const shownImageUrl = imagePreviews[uploadKey] || imageUrl;

    if (shownImageUrl) {
      return (
        <div
          style={{
            position: "relative",
            width: "75px",
            height: "55px",
            borderRadius: "6px",
            overflow: "hidden",
            border: "1px solid #d9d9d9",
            margin: "0 auto",
          }}
        >
          <img src={shownImageUrl} alt={tripLabel} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              display: "flex",
              gap: "2px",
            }}
          >
            <Upload
              showUploadList={false}
              beforeUpload={(file) => handleTableCellImageUpload(file, record.key, tripField)}
            >
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                loading={isUploading}
                style={{
                  width: "20px",
                  height: "20px",
                  fontSize: "10px",
                  padding: 0,
                }}
              />
            </Upload>
            <Popconfirm
              title="Delete image?"
              description="Are you sure to remove this image?"
              onConfirm={() => handleRemoveImage(record.key, tripField)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="primary"
                danger
                size="small"
                icon={<DeleteOutlined />}
                style={{
                  width: "20px",
                  height: "20px",
                  fontSize: "10px",
                  padding: 0,
                }}
              />
            </Popconfirm>
          </div>
        </div>
      );
    }

    return (
      <Upload showUploadList={false} beforeUpload={(file) => handleTableCellImageUpload(file, record.key, tripField)}>
        <Button type="dashed" size="large" icon={<UploadOutlined />} loading={isUploading} style={{ fontSize: "11px" }}>
          {isUploading ? (uploadProgress === null ? "Preparing" : "Uploading") : "Upload"}
        </Button>
      </Upload>
    );
  };

  const showAddModal = () => {
    setEditingKey(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditClick = (record) => {
    setEditingKey(record.key);
    form.setFieldsValue({
      ...record,
    });
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const isEditing = Boolean(editingKey);
      const previousReport = isEditing ? reports.find((item) => item.key === editingKey) : null;
      const temporaryKey = isEditing ? editingKey : `pending-${Date.now()}`;
      const optimisticReport = {
        ...(previousReport || {
          trip1Image: null,
          trip2Image: null,
          trip3Image: null,
          trip4Image: null,
          trip5Image: null,
        }),
        ...values,
        _id: temporaryKey,
        key: temporaryKey,
        sr: previousReport?.sr ?? reports.length + 1,
      };

      setReports((current) =>
        isEditing
          ? current.map((item) => (item.key === editingKey ? optimisticReport : item))
          : [...current, optimisticReport],
      );

      try {
        const savedReport = isEditing
          ? await apiRequest(`/reports/${editingKey}`, { method: "PATCH", body: values })
          : await apiRequest("/reports", { method: "POST", body: values });

        setReports((current) =>
          current.map((item) =>
            item.key === temporaryKey ? { ...savedReport, key: savedReport._id, sr: item.sr } : item,
          ),
        );
        message.success(isEditing ? "Record updated successfully!" : "New vehicle record added!");
      } catch (error) {
        setReports((current) =>
          isEditing
            ? current.map((item) => (item.key === editingKey ? previousReport : item))
            : current.filter((item) => item.key !== temporaryKey),
        );
        throw error;
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.message);
    }
  };

  const handleDeleteRow = async (key) => {
    const previousData = reports;
    setReports((current) => current.filter((item) => item.key !== key).map(normalizeReport));
    try {
      await apiRequest(`/reports/${key}`, { method: "DELETE" });
      message.success("Vehicle record deleted successfully!");
    } catch (error) {
      setReports(previousData);
      message.error(error.message);
    }
  };

  // Table Columns Setup
  const textColumnFilters = (field) => makeColumnFilters(visibleDataSource, (record) => record[field]);
  const imageColumnFilters = (field) =>
    makeColumnFilters(visibleDataSource, (record) => (record[field] ? "Uploaded" : "Missing"));
  const tripFields = ["trip1Image", "trip2Image", "trip3Image", "trip4Image", "trip5Image"];
  const tripCount = (record) =>
    tripFields.filter((field) => Boolean(imagePreviews[`${record.key}:${field}`] || record[field])).length;
  const searchedDataSource = visibleDataSource.filter((record) =>
    String(record.vehicleNo || "")
      .toLowerCase()
      .includes(vehicleSearch.trim().toLowerCase()),
  );

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.calcProperties = { fullCalcOnLoad: true, forceFullCalc: true };
      const worksheet = workbook.addWorksheet("Vehicle Reports");
      const border = { style: "thin", color: { argb: "FF000000" } };
      const rows = searchedDataSource.map((record) => {
        const trips = [
          record.trip1Image,
          record.trip2Image,
          record.trip3Image,
          record.trip4Image,
          record.trip5Image,
        ];
        const count = trips.filter(Boolean).length;
        return [
          record.sr,
          record.amo || "",
          record.uc || "",
          record.supervisor || "",
          record.vehicleNo || "",
          "",
          "",
          "",
          "",
          "",
          count,
          count > 0 ? "Yes" : "No",
          record.remarks || "",
        ];
      });
      const columnWidths = [8, 28, 10, 30, 22, 20, 20, 20, 20, 20, 16, 22, 30];

      worksheet.columns = exportHeaders.map((header, index) => ({
        header,
        key: `column${index + 1}`,
        width: columnWidths[index],
      }));
      worksheet.mergeCells("A1:M1");
      worksheet.getCell("A1").value = `Daily Trip Report of Loader Rickshaw | Date: ${todayDate}`;
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: "Times New Roman", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
        cell.border = { top: border, right: border, bottom: border, left: border };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      worksheet.getRow(1).height = 32;

      const headerRow = worksheet.getRow(2);
      headerRow.values = exportHeaders;
      headerRow.height = 60;
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: "Times New Roman", bold: true, size: 14 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC4D79B" } };
        cell.border = { top: border, right: border, bottom: border, left: border };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });

      rows.forEach((rowValues) => {
        const row = worksheet.addRow(rowValues);
        row.height = 65;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: "Times New Roman", bold: true, size: 12 };
          cell.border = { top: border, right: border, bottom: border, left: border };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });
      });

      let failedImageCount = 0;
      const imageJobs = searchedDataSource.flatMap((record, rowIndex) =>
        [
          record.trip1Image,
          record.trip2Image,
          record.trip3Image,
          record.trip4Image,
          record.trip5Image,
        ]
          .map((image, tripIndex) => (image?.url ? { imageUrl: image.url, rowIndex, tripIndex } : null))
          .filter(Boolean),
      );

      // Download in batches of 6 to prevent network timeouts/drops
      const batchSize = 6;
      const embeddedImages = [];
      for (let i = 0; i < imageJobs.length; i += batchSize) {
        const batch = imageJobs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (job) => {
            try {
              return { ...job, ...(await addExcelImage(workbook, job.imageUrl)) };
            } catch {
              failedImageCount += 1;
              return null;
            }
          }),
        );
        embeddedImages.push(...batchResults);
      }

      embeddedImages.filter(Boolean).forEach(({ imageId, width, height, rowIndex, tripIndex }) => {
        // High quality preview fitting neatly inside cell
        const scale = Math.min(136 / width, 78 / height, 1);
        const scaledWidth = Math.round(width * scale);
        const scaledHeight = Math.round(height * scale);

        worksheet.addImage(imageId, {
          tl: { col: tripIndex + 5 + 0.04, row: rowIndex + 2 + 0.05 },
          ext: { width: scaledWidth, height: scaledHeight },
          editAs: "oneCell",
        });
      });

      const lastDataRow = Math.max(2, rows.length + 2);
      const totalRow = worksheet.getRow(lastDataRow + 1);
      totalRow.height = 60;

      const grandTotalFont = {
        name: "Times New Roman",
        bold: true,
        size: 26,
        color: { argb: "FFFFFFFF" },
      };
      const grandTotalFill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E79" },
      };

      for (let col = 1; col <= 13; col++) {
        const cell = worksheet.getCell(totalRow.number, col);
        cell.font = grandTotalFont;
        cell.fill = grandTotalFill;
        cell.border = { top: border, right: border, bottom: border, left: border };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }

      worksheet.mergeCells(`A${totalRow.number}:J${totalRow.number}`);
      const grandTotalLabel = worksheet.getCell(`A${totalRow.number}`);
      grandTotalLabel.value = "Grand Total";

      const totalTripsSum = rows.reduce((sum, row) => sum + Number(row[10] || 0), 0);
      const totalTripsCell = worksheet.getCell(`K${totalRow.number}`);
      totalTripsCell.value = rows.length
        ? { formula: `SUM(K3:K${lastDataRow})`, result: totalTripsSum }
        : 0;

      const archivedCount = rows.filter((row) => row[11] === "Yes").length;
      const archiveRatioCell = worksheet.getCell(`L${totalRow.number}`);
      archiveRatioCell.value = `${archivedCount} / ${rows.length}`;

      worksheet.views = [{ state: "frozen", ySplit: 2, topLeftCell: "A3", showGridLines: true }];
      worksheet.pageSetup = {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        printArea: `A1:M${totalRow.number}`,
        printTitlesRow: "1:2",
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `Daily-Trip-Report-${todayDate}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (failedImageCount) {
        message.warning(`Excel exported, but ${failedImageCount} image(s) could not be included.`);
      } else {
        message.success("Excel exported successfully.");
      }
    } catch {
      message.error("Unable to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    { title: "Sr.#", dataIndex: "sr", key: "sr", width: 50, align: "center", ...textColumnFilters("sr") },
    { title: "AMO", dataIndex: "amo", key: "amo", ...textColumnFilters("amo") },
    { title: "UC", dataIndex: "uc", key: "uc", width: 60, align: "center", ...textColumnFilters("uc") },
    {
      title: "Supervisor Name & #",
      dataIndex: "supervisor",
      key: "supervisor",
      ...textColumnFilters("supervisor"),
    },
    {
      title: "Vehicle / Rickshaw No",
      dataIndex: "vehicleNo",
      key: "vehicleNo",
      ...textColumnFilters("vehicleNo"),
    },
    {
      title: "Trip 01",
      dataIndex: "trip1Image",
      key: "trip1Image",
      align: "center",
      width: 95,
      ...imageColumnFilters("trip1Image"),
      render: (img, record) => renderTableImageCell(img?.url, record, "trip1Image", "Trip 01"),
    },
    {
      title: "Trip 02",
      dataIndex: "trip2Image",
      key: "trip2Image",
      align: "center",
      width: 95,
      ...imageColumnFilters("trip2Image"),
      render: (img, record) => renderTableImageCell(img?.url, record, "trip2Image", "Trip 02"),
    },
    {
      title: "Trip 03",
      dataIndex: "trip3Image",
      key: "trip3Image",
      align: "center",
      width: 95,
      ...imageColumnFilters("trip3Image"),
      render: (img, record) => renderTableImageCell(img?.url, record, "trip3Image", "Trip 03"),
    },
    {
      title: "Trip 04",
      dataIndex: "trip4Image",
      key: "trip4Image",
      align: "center",
      width: 95,
      ...imageColumnFilters("trip4Image"),
      render: (img, record) => renderTableImageCell(img?.url, record, "trip4Image", "Trip 04"),
    },
    {
      title: "Trip 05",
      dataIndex: "trip5Image",
      key: "trip5Image",
      align: "center",
      width: 95,
      ...imageColumnFilters("trip5Image"),
      render: (img, record) => renderTableImageCell(img?.url, record, "trip5Image", "Trip 05"),
    },
    {
      title: "Total Trips",
      key: "totalTrips",
      align: "center",
      width: 105,
      ...makeColumnFilters(visibleDataSource, (record) => tripCount(record)),
      render: (_, record) => {
        const count = tripCount(record);
        let tagColor = "error";
        if (count === 5) tagColor = "success";
        else if (count >= 3) tagColor = "processing";
        else if (count >= 1) tagColor = "warning";

        return (
          <Tag color={tagColor} style={{ fontWeight: "bold", padding: "2px 8px" }}>
            {count} / 5
          </Tag>
        );
      },
    },
    {
      title: "Trip Archived",
      key: "tripArchived",
      align: "center",
      width: 110,
      ...makeColumnFilters(visibleDataSource, (record) => (tripCount(record) > 0 ? "Yes" : "No")),
      render: (_, record) => {
        const isAchieved = tripCount(record) > 0;
        return isAchieved ? (
          <Tag color="success" style={{ fontWeight: "bold", padding: "2px 8px" }}>
            Yes
          </Tag>
        ) : (
          <Tag color="error" style={{ fontWeight: "bold", padding: "2px 8px" }}>
            No
          </Tag>
        );
      },
    },
    { title: "Remarks", dataIndex: "remarks", key: "remarks", ...textColumnFilters("remarks") },
    {
      title: "Action",
      key: "action",
      align: "center",
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined style={{ color: "#1890ff" }} />}
            onClick={() => handleEditClick(record)}
          />
          <Popconfirm
            title="Delete Record"
            description="Are you sure you want to delete this vehicle record permanently?"
            onConfirm={() => handleDeleteRow(record.key)}
            okText="Yes"
            cancelText="No"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const centeredColumns = columns.map((column) => ({ ...column, align: "center" }));

  return (
    <main className="container my-4">
      {/* Top Header */}
      <Row className="mb-3" align="middle" justify="space-between">
        <Col>
          <h3 className="fw-bold m-0 text-center text-success">{`Suthra Punjab Agency (SPA) OKARA`}</h3>
        </Col>
        <Col>
          <Space direction="vertical" align="end">
            <div className="fw-semibold">{`Today · ${todayDate}`}</div>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => setRefreshVersion((v) => v + 1)} title="Refresh Records">
                Refresh
              </Button>
              <Button icon={<FileExcelOutlined />} loading={isExporting} onClick={handleExportExcel}>
                Export Excel
              </Button>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={showAddModal}>
                Add Record
              </Button>
            </Space>
          </Space>
        </Col>
      </Row>

      <Row className="mb-2">
        <Col xs={24} md={8}>
          <Input.Search
            allowClear
            value={vehicleSearch}
            onChange={(event) => setVehicleSearch(event.target.value)}
            placeholder="Search vehicle number"
          />
        </Col>
      </Row>

      <Table
        className="table-responsive"
        columns={centeredColumns}
        dataSource={searchedDataSource}
        loading={isLoading}
        bordered
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1350 }}
      />

      {/* Shared Modal for Add & Edit or with cron */}
      <Modal
        title={editingKey ? "Edit Vehicle Record" : "Add New Vehicle Record"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText={editingKey ? "Update Record" : "Save Record"}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-3">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amo" label="AMO" rules={[{ required: true, message: "Please enter AMO" }]}>
                <Input placeholder="e.g. Haq Nawaz 0345-7538817" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="supervisor"
                label="Supervisor Name & Contact"
                rules={[{ required: true, message: "Please enter Supervisor" }]}
              >
                <Input placeholder="e.g. Jahanzaib" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="uc" label="UC" rules={[{ required: true, message: "Please enter UC" }]}>
                <Input placeholder="e.g. 8" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="vehicleNo"
                label="Vehicle / Rickshaw No"
                rules={[{ required: true, message: "Please enter Vehicle No" }]}
              >
                <Input placeholder="e.g. OKR-LR-050" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} placeholder="Enter remarks..." />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
};

export default Users;
