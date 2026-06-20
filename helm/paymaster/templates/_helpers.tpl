{{/*
Expand the name of the chart.
*/}}
{{- define "fluid.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "fluid.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "fluid.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "fluid.labels" -}}
helm.sh/chart: {{ include "fluid.chart" . }}
app.kubernetes.io/name: {{ include "fluid.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels for a given component.
Usage: {{ include "fluid.selectorLabels" (dict "root" . "component" "node-api") }}
*/}}
{{- define "fluid.selectorLabels" -}}
app.kubernetes.io/name: {{ include "fluid.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Name of the shared Fluid secrets object.
*/}}
{{- define "fluid.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "fluid.fullname" . }}-secrets
{{- end }}
{{- end }}

{{/*
Name of the PostgreSQL secret.
*/}}
{{- define "fluid.postgresSecretName" -}}
{{- if .Values.postgres.existingSecret }}
{{- .Values.postgres.existingSecret }}
{{- else }}
{{- include "fluid.fullname" . }}-postgres
{{- end }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "fluid.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "fluid.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
