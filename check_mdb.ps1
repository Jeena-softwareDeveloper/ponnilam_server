$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\access\SS\server\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;")
$rs = $conn.OpenSchema(20) # adSchemaTables = 20
while(-not $rs.EOF) {
    if ($rs.Fields.Item("TABLE_TYPE").Value -eq "TABLE") {
        Write-Host "TABLE: " $rs.Fields.Item("TABLE_NAME").Value
    }
    $rs.MoveNext()
}
$conn.Close()
